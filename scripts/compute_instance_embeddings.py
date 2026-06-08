"""Per-instance 2D embedding for /users/spatial-graph.

Reads .embedding/instance-features.jsonl (one {nodeId, tokens[]} per line),
TF-IDF weights the tokens, projects to 2D with UMAP (cosine), computes cosine
kNN, and upserts AccInstanceEmbedding in Postgres. Pure functions are unit-tested
in test_compute_instance_embeddings.py; main() does the I/O.
"""
import json
import os
import sys
import uuid
from datetime import datetime, timezone

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.neighbors import NearestNeighbors

RANDOM_STATE = 42
HALF_EXTENT = 1000.0
K_NEIGHBORS = 10


def tfidf_matrix(docs):
    """docs: list[list[str]] token lists. Returns (sparse matrix, vocab list)."""
    vec = TfidfVectorizer(analyzer=lambda toks: toks, lowercase=False, min_df=1)
    m = vec.fit_transform(docs)
    return m, vec.get_feature_names_out().tolist()


def project_umap(matrix):
    """High-dim sparse TF-IDF -> 2D float array. UMAP with cosine metric.
    PCA fallback if umap import fails (spec §10)."""
    try:
        import umap
        reducer = umap.UMAP(n_neighbors=15, min_dist=0.1, metric="cosine", random_state=RANDOM_STATE)
        return np.asarray(reducer.fit_transform(matrix), dtype=np.float64)
    except (ImportError, ModuleNotFoundError) as e:  # fallback only when umap is not installed (spec §10)
        print(f"UMAP unavailable ({e}); falling back to PCA", file=sys.stderr)
        from sklearn.decomposition import TruncatedSVD
        svd = TruncatedSVD(n_components=2, random_state=RANDOM_STATE)
        return np.asarray(svd.fit_transform(matrix), dtype=np.float64)


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


def _upsert(node_ids, coords, neighbors, run_id):
    import psycopg
    url = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("DIRECT_URL or DATABASE_URL must be set")
    now = datetime.now(timezone.utc)
    with psycopg.connect(url) as conn, conn.cursor() as cur:
        for i, nid in enumerate(node_ids):
            cur.execute(
                """
                INSERT INTO "AccInstanceEmbedding" ("nodeId","x","y","neighbors","embeddingRunId","updatedAt")
                VALUES (%s,%s,%s,%s,%s,%s)
                ON CONFLICT ("nodeId") DO UPDATE SET
                  "x"=EXCLUDED."x","y"=EXCLUDED."y","neighbors"=EXCLUDED."neighbors",
                  "embeddingRunId"=EXCLUDED."embeddingRunId","updatedAt"=EXCLUDED."updatedAt"
                """,
                (nid, float(coords[i][0]), float(coords[i][1]),
                 json.dumps(neighbors.get(nid, [])), run_id, now),
            )
        conn.commit()


def main():
    path = os.path.join(os.getcwd(), ".embedding", "instance-features.jsonl")
    node_ids, docs = _load_jsonl(path)
    if not node_ids:
        raise SystemExit("no instance features found; run build-instance-features.ts first")
    matrix, _vocab = tfidf_matrix(docs)
    coords = normalize_coords(project_umap(matrix))
    assert np.all(np.isfinite(coords)), "non-finite coordinates produced"
    neighbors = knn_neighbors(matrix, node_ids)
    run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
    _upsert(node_ids, coords, neighbors, run_id)
    print(f"Upserted {len(node_ids)} AccInstanceEmbedding rows (run {run_id})")


if __name__ == "__main__":
    main()
