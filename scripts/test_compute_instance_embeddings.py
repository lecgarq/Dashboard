import numpy as np
from compute_instance_embeddings import normalize_coords, tfidf_matrix, knn_neighbors

def test_normalize_coords_fits_box():
    xy = np.array([[0.0, 0.0], [10.0, -5.0], [-2.0, 3.0]])
    out = normalize_coords(xy, half_extent=100.0)
    assert out.shape == xy.shape
    assert np.max(np.abs(out)) <= 100.0 + 1e-6
    assert np.max(np.abs(out)) >= 99.0  # largest coord pinned near the box edge

def test_tfidf_matrix_shapes():
    docs = [["role:a", "mod:x"], ["role:a", "mod:y"], ["role:b"]]
    m, vocab = tfidf_matrix(docs)
    assert m.shape[0] == 3
    assert m.shape[1] == len(vocab)
    assert "role:a" in vocab

def test_knn_neighbors_excludes_self_and_ranks():
    docs = [["role:a", "mod:x"], ["role:a", "mod:x"], ["role:b"]]
    m, _ = tfidf_matrix(docs)
    nbrs = knn_neighbors(m, ["n0", "n1", "n2"], k=1)
    assert nbrs["n0"][0]["nodeId"] == "n1"
    assert nbrs["n0"][0]["nodeId"] != "n0"
    assert 0.0 <= nbrs["n0"][0]["score"] <= 1.0
