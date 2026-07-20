"""Per-instance 2D embedding for /users/spatial-graph (Phase 29 hybrid rewrite).

Reads .embedding/instance-features.jsonl (one {nodeId, tokens[], numerics{}} per
line), builds a HYBRID matrix — TF-IDF categorical block + normalized numeric
block, block-scaled to equal mean row-norm so magnitude and identity carry
comparable influence — then:
  - projects the FULL node set to 2D with PaCMAP (angular metric, fixed seed);
    dedupe-then-expand is retired — within-archetype placement is now real
    numeric variation (EMB-04);
  - applies residual jitter ONLY to rows still byte-identical after numerics;
  - KMeans-clusters the 2D positions so color can == spatial group;
  - computes twin-collapsed cosine kNN on the hybrid matrix (Phase 30 v2
    payload: k distinct matches with per-match top-contribution "why" keys,
    plus an exact twin summary {count, capped ids} per node);
  - emits the EMB-05 quality gate: duplicate-profile rate old/new definition and
    trustworthiness(k=10) of the OLD stored coords vs the NEW coords against the
    same hybrid matrix — upsert only when new >= old.
Numeric normalization (EMB-02), documented per-dimension in normalize_numerics:
log1p + max-scale for counts/bytes/days, /5 for bounded ordinals, paired missing
indicators where missing != zero. Pure functions are unit-tested in
test_compute_instance_embeddings.py; main() does the I/O.
"""
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone

import numpy as np
import scipy.sparse as sp
from sklearn.cluster import KMeans
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.manifold import trustworthiness
from sklearn.neighbors import NearestNeighbors

RANDOM_STATE = 42
HALF_EXTENT = 1000.0
K_NEIGHBORS = 10
TWIN_ID_CAP = 10              # max twin nodeIds stored per node (count stays exact)
WHY_KEYS = 3                  # top contributing dimension keys per match
N_CLUSTERS = 12
JITTER_FRAC = 0.012
SVD_COMPONENTS = 100          # densification width before PaCMAP
TRUST_SAMPLE = 5000           # trustworthiness subsample cap (n^2 distance matrix)
TRUST_K = 10

# Numeric block layout (EMB-02). Order is the column order.
#   log1p + max-scale (unbounded counts/bytes/days; missing ~ none unless noted):
LOG_COLS = ["accessibleDataBytes", "activityTotal", "folderBreadth", "membershipAgeDays"]
#   linear /5 (bounded ordinals 0..5):
ORDINAL_COLS = ["permissionStrength", "riskScore"]
#   paired missing indicators — for these, missing != zero (unknown addedOn /
#   unknown grant strength), so a 0/1 "<name>_missing" column disambiguates the
#   0 the value column falls back to. For the other numerics, null means "none
#   observed" and the cov:<coverage> categorical token carries crawl truth.
MISSING_INDICATOR_COLS = ["membershipAgeDays", "permissionStrength"]


def tfidf_matrix(docs):
    """docs: list[list[str]] token lists. Returns (sparse matrix, vocab list)."""
    vec = TfidfVectorizer(analyzer=lambda toks: toks, lowercase=False, min_df=1)
    m = vec.fit_transform(docs)
    return m, vec.get_feature_names_out().tolist()


def normalize_numerics(rows):
    """rows: list[dict] raw numerics ({} / missing keys / None tolerated).
    Returns (dense float64 matrix, column names). Per-dimension rules:
      - LOG_COLS: null->0, log1p, then max-scale so max==1.0 (guard max=0);
      - ORDINAL_COLS: null->0, /5.0 (bounded 0..5 ordinals);
      - MISSING_INDICATOR_COLS additionally get '<name>_missing' 0/1 columns."""
    n = len(rows)
    cols = LOG_COLS + ORDINAL_COLS + [f"{c}_missing" for c in MISSING_INDICATOR_COLS]
    out = np.zeros((n, len(cols)), dtype=np.float64)
    for i, row in enumerate(rows):
        row = row or {}
        for j, c in enumerate(LOG_COLS):
            v = row.get(c)
            out[i, j] = np.log1p(float(v)) if v is not None and v > 0 else 0.0
        base = len(LOG_COLS)
        for j, c in enumerate(ORDINAL_COLS):
            v = row.get(c)
            out[i, base + j] = (float(v) / 5.0) if v is not None else 0.0
        base = len(LOG_COLS) + len(ORDINAL_COLS)
        for j, c in enumerate(MISSING_INDICATOR_COLS):
            out[i, base + j] = 1.0 if row.get(c) is None else 0.0
    # max-scale the log columns
    for j in range(len(LOG_COLS)):
        mx = out[:, j].max()
        if mx > 0:
            out[:, j] /= mx
    return out, cols


def build_hybrid_matrix(tfidf, numeric):
    """Block-scale the numeric block so its mean row-norm equals the TF-IDF
    block's (balanced hybrid, CONTEXT decision 2), then hstack. Returns csr."""
    tfidf = sp.csr_matrix(tfidf)
    numeric = np.asarray(numeric, dtype=np.float64)
    t_norm = float(np.mean(np.sqrt(tfidf.multiply(tfidf).sum(axis=1))))
    n_norm = float(np.mean(np.linalg.norm(numeric, axis=1)))
    scale = (t_norm / n_norm) if n_norm > 0 else 1.0
    return sp.hstack([tfidf, sp.csr_matrix(numeric * scale)], format="csr")


def dedupe_docs(docs):
    """Collapse identical entries (hashable rows). Returns (first_row_indices,
    uidx_of_node). Survives Phase 29 as the duplicate-rate MEASUREMENT tool and
    the residual-jitter grouping — no longer on the position path."""
    uniq = {}
    first = []
    uidx = np.empty(len(docs), dtype=np.int64)
    for i, toks in enumerate(docs):
        key = tuple(toks)
        u = uniq.get(key)
        if u is None:
            u = len(first)
            uniq[key] = u
            first.append(i)
        uidx[i] = u
    return first, uidx


def hybrid_dup_keys(docs, numeric_rows):
    """Hashable per-row keys for the NEW duplicate definition: tokens + raw
    numerics. Byte-identical here == still identical after the numeric block."""
    keys = []
    fields = LOG_COLS + ORDINAL_COLS
    for toks, row in zip(docs, numeric_rows):
        row = row or {}
        keys.append(tuple(toks) + tuple(row.get(c) for c in fields))
    return keys


def project_pacmap(matrix):
    """Project the hybrid matrix to 2D with PaCMAP (angular, fixed seed).
    TruncatedSVD densifies wide sparse input to SVD_COMPONENTS first (pacmap
    needs dense; apply_pca=False because we own the reduction). Small-N (<10)
    keeps the SVD fallback."""
    matrix = sp.csr_matrix(matrix)
    n = matrix.shape[0]
    if n < 10:
        comps = TruncatedSVD(n_components=2, random_state=RANDOM_STATE).fit_transform(matrix) \
            if matrix.shape[1] >= 2 else np.zeros((n, 2))
        return np.asarray(comps, dtype=np.float64)
    if matrix.shape[1] > SVD_COMPONENTS:
        k = min(SVD_COMPONENTS, matrix.shape[1] - 1, n - 1)
        dense = TruncatedSVD(n_components=k, random_state=RANDOM_STATE).fit_transform(matrix)
    else:
        dense = matrix.toarray()
    import pacmap  # verified 0.9.1: distance in {euclidean, manhattan, angular, hamming}
    nn = min(10, n - 1)
    xy = pacmap.PaCMAP(
        n_components=2, n_neighbors=nn, distance="angular",
        random_state=RANDOM_STATE, apply_pca=False,
    ).fit_transform(dense.astype(np.float32))
    return np.asarray(xy, dtype=np.float64)


def cluster_coords(coords, k=N_CLUSTERS):
    """KMeans on 2D coords -> int cluster label per row. k clamped to n."""
    n = len(coords)
    kk = max(1, min(k, n))
    if kk == 1:
        return np.zeros(n, dtype=np.int64)
    return KMeans(n_clusters=kk, n_init=10, random_state=RANDOM_STATE).fit_predict(coords).astype(np.int64)


def residual_jitter(coords, dup_keys, frac=JITTER_FRAC, seed=RANDOM_STATE):
    """Gaussian jitter ONLY for rows whose dup_key occurs more than once —
    residual separation for profiles still byte-identical after the numeric
    block (EMB-04). Distinct rows are untouched. Deterministic."""
    coords = np.asarray(coords, dtype=np.float64)
    counts = {}
    for k in dup_keys:
        counts[k] = counts.get(k, 0) + 1
    mask = np.array([counts[k] > 1 for k in dup_keys], dtype=bool)
    if not mask.any():
        return coords.copy()
    rng = np.random.RandomState(seed)
    span = coords.max(axis=0) - coords.min(axis=0)
    out = coords.copy()
    noise = rng.normal(0.0, 1.0, size=(int(mask.sum()), coords.shape[1]))
    out[mask] += noise * (span * frac)
    return out


def normalize_coords(xy, half_extent=HALF_EXTENT):
    """Scale so the largest abs coordinate == half_extent (stable framing)."""
    xy = np.asarray(xy, dtype=np.float64)
    xy = xy - xy.mean(axis=0, keepdims=True)
    max_abs = float(np.max(np.abs(xy))) or 1.0
    return xy * (half_extent / max_abs)


def twin_groups(dup_keys):
    """Exact-vector twin groups from hybrid dup keys (tokens + raw numerics).
    Returns (group_of_row int64[n], members list[list[row_idx]]). Deterministic
    (first-seen order), same grouping residual_jitter uses."""
    first, uidx = dedupe_docs(dup_keys)
    members = [[] for _ in first]
    for i, u in enumerate(uidx):
        members[u].append(i)
    return uidx, members


def top_contribution_keys(row_a, row_b, dim_keys, top=WHY_KEYS):
    """Top contributing dimension keys of a pair's cosine similarity on the
    hybrid matrix: contribution[d] = a[d]*b[d] (all blocks non-negative, so
    ranking by raw product == ranking by share of the dot product). Excludes
    '_missing' indicator columns and 'cov:' tokens — shared missingness /
    crawl-coverage metadata is not a human explanation. Returns <= top keys,
    positive contributions only, strongest first."""
    prod = sp.csr_matrix(row_a).multiply(sp.csr_matrix(row_b)).tocoo()
    pairs = [
        (float(v), dim_keys[j])
        for j, v in zip(prod.col, prod.data)
        if v > 0 and not dim_keys[j].endswith("_missing") and not dim_keys[j].startswith("cov:")
    ]
    pairs.sort(key=lambda p: (-p[0], p[1]))
    return [k for _, k in pairs[:top]]


def structured_neighbors(matrix, node_ids, dup_keys, k=K_NEIGHBORS,
                         twin_cap=TWIN_ID_CAP, dim_keys=None):
    """Twin-collapsed cosine kNN (Phase 30 v2 payload). kNN runs over one
    representative row per exact-vector twin group, so every match is a
    DISTINCT profile; twin members share their group's match list (their
    vectors are byte-identical, so the math is exact for each member).

    Returns {nodeId: {"v": 2,
                      "matches": [{"nodeId", "score", "why": [keys]}],
                      "twins": {"count": group_size - 1,
                                "ids": [<= twin_cap other member nodeIds]}}}.
    """
    matrix = sp.csr_matrix(matrix)
    group_of, members = twin_groups(dup_keys)
    firsts = [m[0] for m in members]
    uniq = matrix[firsts]
    n_groups = len(firsts)
    kk = min(k + 1, n_groups)
    nn = NearestNeighbors(n_neighbors=kk, metric="cosine").fit(uniq)
    dist, idx = nn.kneighbors(uniq)

    group_matches = []
    for g in range(n_groups):
        row = []
        for j, d in zip(idx[g], dist[g]):
            if j == g:
                continue
            why = top_contribution_keys(uniq[g], uniq[j], dim_keys) if dim_keys else []
            row.append({
                "nodeId": node_ids[firsts[j]],
                "score": round(1.0 - float(d), 4),
                "why": why,
            })
            if len(row) >= k:
                break
        group_matches.append(row)

    out = {}
    for i, nid in enumerate(node_ids):
        g = int(group_of[i])
        mates = members[g]
        out[nid] = {
            "v": 2,
            "matches": group_matches[g],
            "twins": {
                "count": len(mates) - 1,
                "ids": [node_ids[j] for j in mates if j != i][:twin_cap],
            },
        }
    return out


def trust_score(hybrid, coords, sample_idx):
    """trustworthiness(k=TRUST_K, cosine) on a row subset (n^2 memory guard)."""
    sub = hybrid[sample_idx]
    return float(trustworthiness(sub, np.asarray(coords)[sample_idx],
                                 n_neighbors=TRUST_K, metric="cosine"))


def _load_jsonl(path):
    node_ids, docs, numerics = [], [], []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            node_ids.append(rec["nodeId"])
            docs.append(rec["tokens"])
            numerics.append(rec.get("numerics") or {})
    return node_ids, docs, numerics


def _db_url():
    url = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DIRECT_URL or DATABASE_URL must be set")
    return url


def _fetch_old_coords(node_ids):
    """Read the CURRENT stored coords (pre-overwrite) for the gate baseline.
    Returns {nodeId: (x, y)}; empty dict on first run."""
    import psycopg
    out = {}
    with psycopg.connect(_db_url()) as conn, conn.cursor() as cur:
        cur.execute('SELECT "nodeId","x","y" FROM "AccInstanceEmbedding"')
        for nid, x, y in cur.fetchall():
            out[nid] = (float(x), float(y))
    return {nid: out[nid] for nid in node_ids if nid in out}


def _upsert(node_ids, coords, clusters, neighbors, run_id):
    import psycopg
    now = datetime.now(timezone.utc)
    with psycopg.connect(_db_url()) as conn, conn.cursor() as cur:
        for i, nid in enumerate(node_ids):
            cur.execute(
                """
                INSERT INTO "AccInstanceEmbedding"
                  ("nodeId","x","y","cluster","neighbors","embeddingRunId","updatedAt")
                VALUES (%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT ("nodeId") DO UPDATE SET
                  "x"=EXCLUDED."x","y"=EXCLUDED."y","cluster"=EXCLUDED."cluster",
                  "neighbors"=EXCLUDED."neighbors",
                  "embeddingRunId"=EXCLUDED."embeddingRunId","updatedAt"=EXCLUDED."updatedAt"
                """,
                (nid, float(coords[i][0]), float(coords[i][1]), int(clusters[i]),
                 json.dumps(neighbors.get(nid, [])), run_id, now),
            )
        conn.commit()


def _prune(node_ids):
    """PIPE-02: delete rows whose nodeId is absent from the current snapshot set.
    Called strictly AFTER the EMB-05 gate-pass point (a gate failure exits before
    any write, including this delete). Delete-only; returns the pruned count."""
    import psycopg
    with psycopg.connect(_db_url()) as conn, conn.cursor() as cur:
        cur.execute(
            'DELETE FROM "AccInstanceEmbedding" WHERE NOT ("nodeId" = ANY(%s))',
            (list(node_ids),),
        )
        pruned = cur.rowcount
        conn.commit()
    return pruned


def main():
    t0 = time.time()
    path = os.path.join(os.getcwd(), ".embedding", "instance-features.jsonl")
    node_ids, docs, numeric_rows = _load_jsonl(path)
    if not node_ids:
        raise SystemExit("no instance features found; run build-instance-features.ts first")
    n = len(node_ids)

    tfidf, vocab = tfidf_matrix(docs)
    numeric, num_cols = normalize_numerics(numeric_rows)
    hybrid = build_hybrid_matrix(tfidf, numeric)
    print(f"nodes={n} vocab={tfidf.shape[1]} numeric_cols={len(num_cols)} "
          f"hybrid_cols={hybrid.shape[1]}")

    # EMB-04: duplicate-profile rate, old definition (tokens only) vs new (tokens+numerics)
    first_old, _ = dedupe_docs(docs)
    new_keys = hybrid_dup_keys(docs, numeric_rows)
    first_new, _ = dedupe_docs(new_keys)
    dup_old = 100.0 * (1 - len(first_old) / n)
    dup_new = 100.0 * (1 - len(first_new) / n)
    print(f"duplicate-rate old-definition (tokens)={dup_old:.1f}% "
          f"new-definition (tokens+numerics)={dup_new:.1f}% "
          f"(unique {len(first_old)} -> {len(first_new)})")

    coords = normalize_coords(residual_jitter(project_pacmap(hybrid), new_keys))
    clusters = cluster_coords(coords, N_CLUSTERS)
    assert np.all(np.isfinite(coords)), "non-finite coordinates produced"

    # EMB-05 gate: trustworthiness(k=10) old stored coords vs new, same hybrid, same rows
    old_map = _fetch_old_coords(node_ids)
    if old_map:
        common = [i for i, nid in enumerate(node_ids) if nid in old_map]
        rng = np.random.RandomState(RANDOM_STATE)
        pool = np.asarray(common, dtype=np.int64)
        sample = pool if len(pool) <= TRUST_SAMPLE else rng.choice(pool, TRUST_SAMPLE, replace=False)
        old_xy = np.zeros((n, 2))
        for i in common:
            old_xy[i] = old_map[node_ids[i]]
        t_old = trust_score(hybrid, old_xy, sample)
        t_new = trust_score(hybrid, coords, sample)
        print(f"trustworthiness(k={TRUST_K}, cosine, sample={len(sample)}): "
              f"old={t_old:.4f} new={t_new:.4f}")
        if t_new < t_old - 1e-9:
            print("GATE FAIL: new trustworthiness below stored baseline — NOT upserting.")
            sys.exit(1)
        print("GATE PASS: new >= old.")
    else:
        print("no stored embedding found (first run) — trustworthiness comparison "
              "skipped; gate rests on the duplicate-rate report above.")

    # SIM-01/02: twin-collapsed structured neighbors + why keys (v2 payload).
    _, members = twin_groups(new_keys)
    sizes = np.array([len(m) for m in members], dtype=np.int64)
    print(f"twin-group sizes: groups={len(sizes)} multi-member={int((sizes > 1).sum())} "
          f"max={int(sizes.max())} median={float(np.median(sizes)):.1f} "
          f"p95={float(np.percentile(sizes, 95)):.1f}")
    neighbors = structured_neighbors(hybrid, node_ids, new_keys,
                                     dim_keys=list(vocab) + num_cols)
    run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
    _upsert(node_ids, coords, clusters, neighbors, run_id)
    pruned = _prune(node_ids)
    print(f"Upserted {n} AccInstanceEmbedding rows / Pruned {pruned} stale "
          f"({int(clusters.max()) + 1} clusters, run {run_id}) "
          f"in {time.time() - t0:.1f}s total")


if __name__ == "__main__":
    main()
