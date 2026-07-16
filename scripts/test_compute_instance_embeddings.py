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
    normalize_coords,
    normalize_numerics,
    project_pacmap,
    residual_jitter,
    structured_neighbors,
    tfidf_matrix,
    top_contribution_keys,
    twin_groups,
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

# --- Phase 30 twin-collapsed structured neighbors ---

def test_twin_groups_exact_vector_only():
    # same tokens, different numerics -> DISTINCT groups (exact-vector rule)
    docs = [["role:a"], ["role:a"], ["role:a"], ["role:b"]]
    rows = [{"activityTotal": 1}, {"activityTotal": 1}, {"activityTotal": 2}, {}]
    group_of, members = twin_groups(hybrid_dup_keys(docs, rows))
    assert list(group_of) == [0, 0, 1, 2]
    assert members == [[0, 1], [2], [3]]


def test_structured_neighbors_distinct_matches_and_twin_summary():
    docs = [
        ["role:a", "mod:x"],  # group 0 (3 twins)
        ["role:a", "mod:x"],
        ["role:a", "mod:x"],
        ["role:b"],           # group 1
        ["role:a", "mod:y"],  # group 2
    ]
    rows = [{}] * 5
    ids = [f"n{i}" for i in range(5)]
    m, _ = tfidf_matrix(docs)
    nbrs = structured_neighbors(m, ids, hybrid_dup_keys(docs, rows), k=10)
    p0 = nbrs["n0"]
    # matches: only distinct-group representatives, never a same-group twin
    match_ids = [mt["nodeId"] for mt in p0["matches"]]
    assert set(match_ids) == {"n3", "n4"}  # k fill = min(k, groups-1) = 2
    assert "n1" not in match_ids and "n2" not in match_ids and "n0" not in match_ids
    # ranked: n4 shares role:a with n0, n3 shares nothing
    assert match_ids[0] == "n4"
    assert all(0.0 <= mt["score"] <= 1.0 for mt in p0["matches"])
    # twins: self excluded, count exact, all members share the group match list
    assert p0["twins"] == {"count": 2, "ids": ["n1", "n2"]}
    assert nbrs["n1"]["twins"] == {"count": 2, "ids": ["n0", "n2"]}
    assert nbrs["n1"]["matches"] == p0["matches"]
    # a singleton node has no twins
    assert nbrs["n3"]["twins"] == {"count": 0, "ids": []}


def test_structured_neighbors_twin_cap():
    n_twins = 13
    docs = [["role:a"]] * n_twins + [["role:b"]]
    rows = [{}] * (n_twins + 1)
    ids = [f"n{i}" for i in range(n_twins + 1)]
    m, _ = tfidf_matrix(docs)
    nbrs = structured_neighbors(m, ids, hybrid_dup_keys(docs, rows), k=10, twin_cap=10)
    p = nbrs["n0"]
    assert p["twins"]["count"] == n_twins - 1  # count stays exact (12)
    assert len(p["twins"]["ids"]) == 10        # ids capped
    assert "n0" not in p["twins"]["ids"]


def test_top_contribution_keys_math():
    keys = ["role:a", "mod:x", "cov:known", "act:High", "membershipAgeDays_missing"]
    a = np.array([[0.5, 0.3, 0.4, 0.2, 1.0]])
    b = np.array([[0.5, 0.0, 0.4, 0.2, 1.0]])
    # manual: products = [0.25, 0, 0.16, 0.04, 1.0]; cov:/_missing excluded; zero excluded
    out = top_contribution_keys(a, b, keys)
    assert out == ["role:a", "act:High"]
    # top bound respected
    keys2 = ["k1", "k2", "k3", "k4"]
    ones = np.array([[4.0, 3.0, 2.0, 1.0]])
    assert top_contribution_keys(ones, ones, keys2, top=3) == ["k1", "k2", "k3"]


def test_structured_neighbors_payload_shape():
    docs = [["role:a", "mod:x"], ["role:b", "mod:x"], ["role:c"]]
    rows = [{}] * 3
    ids = ["n0", "n1", "n2"]
    m, vocab = tfidf_matrix(docs)
    nbrs = structured_neighbors(m, ids, hybrid_dup_keys(docs, rows),
                                k=10, dim_keys=list(vocab))
    for p in nbrs.values():
        assert p["v"] == 2
        assert set(p.keys()) == {"v", "matches", "twins"}
        for mt in p["matches"]:
            assert set(mt.keys()) == {"nodeId", "score", "why"}
            assert mt["score"] == round(mt["score"], 4)
            assert len(mt["why"]) <= 3
    # n0-n1 share mod:x -> it must surface as a why key
    p0 = nbrs["n0"]
    top = next(mt for mt in p0["matches"] if mt["nodeId"] == "n1")
    assert "mod:x" in top["why"]

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
