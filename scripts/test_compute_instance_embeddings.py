import json

import numpy as np
from compute_instance_embeddings import (
    LOG_COLS,
    ORDINAL_COLS,
    _load_jsonl,
    build_hybrid_matrix,
    cluster_coords,
    dedupe_docs,
    hybrid_dup_keys,
    knn_neighbors,
    normalize_coords,
    normalize_numerics,
    project_pacmap,
    residual_jitter,
    tfidf_matrix,
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


# --- Phase 29 hybrid pipeline ---

def test_normalize_numerics_rules_and_missing_indicators():
    rows = [
        {"accessibleDataBytes": 1000, "activityTotal": 9, "folderBreadth": 3,
         "membershipAgeDays": 365, "permissionStrength": 5, "riskScore": 2},
        {"accessibleDataBytes": None, "activityTotal": None, "folderBreadth": None,
         "membershipAgeDays": None, "permissionStrength": None, "riskScore": None},
        {},  # missing keys behave like nulls
    ]
    m, cols = normalize_numerics(rows)
    assert m.shape == (3, len(cols))
    assert cols == LOG_COLS + ORDINAL_COLS + ["membershipAgeDays_missing", "permissionStrength_missing"]
    # log cols: max-scaled so the observed max is exactly 1.0; nulls -> 0
    for c in LOG_COLS:
        j = cols.index(c)
        assert m[0, j] == 1.0  # row 0 holds the max for every log col
        assert m[1, j] == 0.0 and m[2, j] == 0.0
    # ordinals: /5 linear — permissionStrength 5 -> 1.0, riskScore 2 -> 0.4
    assert m[0, cols.index("permissionStrength")] == 1.0
    assert abs(m[0, cols.index("riskScore")] - 0.4) < 1e-12
    # missing indicators: 0 when present, 1 when null/absent
    assert m[0, cols.index("membershipAgeDays_missing")] == 0.0
    assert m[1, cols.index("membershipAgeDays_missing")] == 1.0
    assert m[2, cols.index("permissionStrength_missing")] == 1.0


def test_normalize_numerics_ordinal_magnitude_survives():
    # EMB-02 core claim: permstr 5 closer to 4 than to 0 in the numeric block
    rows = [{"permissionStrength": 5}, {"permissionStrength": 4}, {"permissionStrength": 0}]
    m, cols = normalize_numerics(rows)
    j = cols.index("permissionStrength")
    assert abs(m[0, j] - m[1, j]) < abs(m[0, j] - m[2, j])


def test_build_hybrid_matrix_equalizes_block_row_norms():
    docs = [["role:a", "mod:x"], ["role:b"], ["role:a", "mod:y"], ["role:c", "mod:x"]]
    tfidf, vocab = tfidf_matrix(docs)
    numeric = np.array([[0.1, 0.2], [1.0, 0.0], [0.5, 0.5], [0.0, 0.9]])
    hybrid = build_hybrid_matrix(tfidf, numeric)
    assert hybrid.shape == (4, len(vocab) + 2)
    dense = hybrid.toarray()
    t_norm = np.mean(np.linalg.norm(dense[:, : len(vocab)], axis=1))
    n_norm = np.mean(np.linalg.norm(dense[:, len(vocab):], axis=1))
    assert abs(t_norm - n_norm) < 1e-9


def test_residual_jitter_moves_only_duplicates():
    coords = np.array([[0.0, 0.0], [0.0, 0.0], [50.0, 50.0]])
    keys = ["dup", "dup", "solo"]
    out = residual_jitter(coords, keys, frac=0.05, seed=1)
    assert not np.allclose(out[0], coords[0])
    assert not np.allclose(out[1], coords[1])
    assert not np.allclose(out[0], out[1])  # twins separate from each other
    assert np.array_equal(out[2], coords[2])  # distinct row untouched
    # deterministic
    again = residual_jitter(coords, keys, frac=0.05, seed=1)
    assert np.array_equal(out, again)


def test_hybrid_dup_keys_distinguish_numerics():
    docs = [["role:a"], ["role:a"]]
    rows = [{"activityTotal": 1}, {"activityTotal": 2}]
    keys = hybrid_dup_keys(docs, rows)
    assert keys[0] != keys[1]  # same tokens, different numerics -> distinct
    same = hybrid_dup_keys(docs, [{"activityTotal": 1}, {"activityTotal": 1}])
    assert same[0] == same[1]


def test_project_pacmap_shape_finite_deterministic():
    rng = np.random.RandomState(0)
    docs = [[f"role:{i % 4}", f"mod:{i % 3}"] for i in range(60)]
    tfidf, _ = tfidf_matrix(docs)
    numeric = rng.rand(60, 4)
    hybrid = build_hybrid_matrix(tfidf, numeric)
    a = project_pacmap(hybrid)
    b = project_pacmap(hybrid)
    assert a.shape == (60, 2)
    assert np.all(np.isfinite(a))
    assert np.allclose(a, b)  # fixed seed => deterministic


def test_project_pacmap_small_n_svd_fallback():
    docs = [["role:a", "mod:x"], ["role:b", "mod:y"], ["role:c"]]
    tfidf, _ = tfidf_matrix(docs)
    hybrid = build_hybrid_matrix(tfidf, np.zeros((3, 2)))
    out = project_pacmap(hybrid)  # n < 10 -> TruncatedSVD path, no pacmap
    assert out.shape == (3, 2)
    assert np.all(np.isfinite(out))


def test_load_jsonl_tolerates_missing_numerics(tmp_path):
    p = tmp_path / "instance-features.jsonl"
    p.write_text(
        json.dumps({"nodeId": "a", "tokens": ["role:a"]}) + "\n" +
        json.dumps({"nodeId": "b", "tokens": ["role:b"], "numerics": {"riskScore": 1}}) + "\n",
        encoding="utf-8",
    )
    node_ids, docs, numerics = _load_jsonl(str(p))
    assert node_ids == ["a", "b"]
    assert numerics[0] == {}  # old-shape line tolerated
    assert numerics[1] == {"riskScore": 1}
