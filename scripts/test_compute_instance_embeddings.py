import numpy as np
from compute_instance_embeddings import (
    normalize_coords,
    tfidf_matrix,
    knn_neighbors,
    dedupe_docs,
    cluster_coords,
)

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

def test_dedupe_docs_collapses_identical_profiles():
    docs = [["role:a"], ["role:a"], ["role:b"], ["role:a"]]
    first, uidx = dedupe_docs(docs)
    # two archetypes: role:a (first at index 0) and role:b (first at index 2)
    assert first == [0, 2]
    assert list(uidx) == [0, 0, 1, 0]

def test_cluster_coords_labels_and_clamps_k():
    coords = np.array([[0.0, 0.0], [0.1, 0.0], [50.0, 50.0], [50.1, 49.9]])
    labels = cluster_coords(coords, k=2)
    assert len(labels) == 4
    assert set(labels.tolist()) == {0, 1}
    # the two near points share a cluster; the two far points share the other
    assert labels[0] == labels[1]
    assert labels[2] == labels[3]
    assert labels[0] != labels[2]
    # k clamped to n when k > number of points
    single = cluster_coords(np.array([[1.0, 1.0]]), k=5)
    assert single.tolist() == [0]
