"""Per-instance 2D embedding for /users/spatial-graph.

Reads .embedding/instance-features.jsonl (one {nodeId, tokens[]} per line),
TF-IDF weights the tokens, then:
  - DEDUPES identical access profiles (~87% of nodes are duplicates of ~3000
    archetypes), so the projection isn't dominated by piled-up identical points;
  - projects the UNIQUE profiles to 2D with t-SNE (cosine) for tight, separated
    clusters (the TF Embedding-Projector / LOOK-AND-FEEL-2 look);
  - KMeans-clusters the 2D positions so color can == spatial group;
  - maps every node back to its archetype coord + small jitter (so duplicate
    density is visible), and computes cosine kNN on the full set.
Upserts x/y/neighbors/cluster into AccInstanceEmbedding. Pure functions are
unit-tested in test_compute_instance_embeddings.py; main() does the I/O.
"""
import json
import os
import uuid
from datetime import datetime, timezone

import numpy as np
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.manifold import TSNE
from sklearn.neighbors import NearestNeighbors

RANDOM_STATE = 42
HALF_EXTENT = 1000.0
K_NEIGHBORS = 10
N_CLUSTERS = 12
JITTER_FRAC = 0.012


def tfidf_matrix(docs):
    """docs: list[list[str]] token lists. Returns (sparse matrix, vocab list)."""
    vec = TfidfVectorizer(analyzer=lambda toks: toks, lowercase=False, min_df=1)
    m = vec.fit_transform(docs)
    return m, vec.get_feature_names_out().tolist()


def dedupe_docs(docs):
    """Collapse identical token-lists. Returns (first_row_indices, uidx_of_node):
    first_row_indices[u] = the first node index whose profile is archetype u;
    uidx_of_node[i] = the archetype index for node i."""
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


def project_tsne(matrix):
    """Dense-ify the (small, deduped) matrix and t-SNE to 2D (cosine).
    Falls back to the first two SVD components when there are too few points
    for a meaningful perplexity."""
    n = matrix.shape[0]
    dense = matrix.toarray()
    if n < 10:
        from sklearn.decomposition import TruncatedSVD
        comps = TruncatedSVD(n_components=2, random_state=RANDOM_STATE).fit_transform(matrix) \
            if matrix.shape[1] >= 2 else np.zeros((n, 2))
        return np.asarray(comps, dtype=np.float64)
    perp = max(5, min(40, n // 100))
    return np.asarray(
        TSNE(n_components=2, metric="cosine", init="pca", perplexity=perp,
             max_iter=1000, random_state=RANDOM_STATE).fit_transform(dense),
        dtype=np.float64,
    )


def cluster_coords(coords, k=N_CLUSTERS):
    """KMeans on 2D coords -> int cluster label per row. k clamped to n."""
    n = len(coords)
    kk = max(1, min(k, n))
    if kk == 1:
        return np.zeros(n, dtype=np.int64)
    return KMeans(n_clusters=kk, n_init=10, random_state=RANDOM_STATE).fit_predict(coords).astype(np.int64)


def expand_with_jitter(unique_coords, uidx_of_node, frac=JITTER_FRAC, seed=RANDOM_STATE):
    """Map each node to its archetype's coord + gaussian jitter (so duplicate
    density is visible instead of perfectly overlapping). Deterministic."""
    rng = np.random.RandomState(seed)
    span = unique_coords.max(axis=0) - unique_coords.min(axis=0)
    base = unique_coords[uidx_of_node]
    return base + rng.normal(0.0, 1.0, size=base.shape) * (span * frac)


def normalize_coords(xy, half_extent=HALF_EXTENT):
    """Scale so the largest abs coordinate == half_extent (stable framing)."""
    xy = np.asarray(xy, dtype=np.float64)
    xy = xy - xy.mean(axis=0, keepdims=True)
    max_abs = float(np.max(np.abs(xy))) or 1.0
    return xy * (half_extent / max_abs)


def knn_neighbors(matrix, node_ids, k=K_NEIGHBORS):
    """Cosine kNN. Returns {nodeId: [{nodeId, score}, ...]} excluding self."""
    n = matrix.shape[0]
    kk = min(k + 1, n)
    nn = NearestNeighbors(n_neighbors=kk, metric="cosine").fit(matrix)
    dist, idx = nn.kneighbors(matrix)
    out = {}
    for i, nid in enumerate(node_ids):
        row = []
        for j, d in zip(idx[i], dist[i]):
            if j == i:
                continue
            row.append({"nodeId": node_ids[j], "score": round(1.0 - float(d), 4)})
            if len(row) >= k:
                break
        out[nid] = row
    return out


def _load_jsonl(path):
    node_ids, docs = [], []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            node_ids.append(rec["nodeId"])
            docs.append(rec["tokens"])
    return node_ids, docs


def _upsert(node_ids, coords, clusters, neighbors, run_id):
    import psycopg
    url = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DIRECT_URL or DATABASE_URL must be set")
    now = datetime.now(timezone.utc)
    with psycopg.connect(url) as conn, conn.cursor() as cur:
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


def main():
    path = os.path.join(os.getcwd(), ".embedding", "instance-features.jsonl")
    node_ids, docs = _load_jsonl(path)
    if not node_ids:
        raise SystemExit("no instance features found; run build-instance-features.ts first")
    matrix, _vocab = tfidf_matrix(docs)
    first, uidx = dedupe_docs(docs)
    unique_matrix = matrix[first]
    print(f"nodes={len(node_ids)} unique_profiles={len(first)} "
          f"({100 * len(first) / len(node_ids):.1f}% unique)")
    ucoords = project_tsne(unique_matrix)
    ulabels = cluster_coords(ucoords, N_CLUSTERS)
    coords = normalize_coords(expand_with_jitter(ucoords, uidx))
    clusters = ulabels[uidx]
    assert np.all(np.isfinite(coords)), "non-finite coordinates produced"
    neighbors = knn_neighbors(matrix, node_ids)
    run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
    _upsert(node_ids, coords, clusters, neighbors, run_id)
    print(f"Upserted {len(node_ids)} AccInstanceEmbedding rows "
          f"({int(clusters.max()) + 1} clusters, run {run_id})")


if __name__ == "__main__":
    main()
