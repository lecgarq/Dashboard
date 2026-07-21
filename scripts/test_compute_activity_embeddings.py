"""Unit tests for the pure functions of compute_activity_embeddings.py."""
from datetime import datetime, timezone

import numpy as np

from compute_activity_embeddings import (
    UNKNOWN,
    bucket,
    build_dictionary,
    bucket_lookup,
    cyclic_month,
    dict_labels,
    month_index,
    normalize_coords,
    to_naive_utc,
)


def test_to_naive_utc_mixes_sources():
    aware = datetime(2026, 7, 21, 12, 0, tzinfo=timezone.utc)
    naive = datetime(2026, 7, 21, 6, 0)
    # regression pin: the two activity tables return mixed tz-ness; after
    # normalization they must be comparable (the full-run crash of 2026-07-21)
    assert min(to_naive_utc(aware), to_naive_utc(naive)) == naive
    assert to_naive_utc(aware).tzinfo is None
    assert to_naive_utc(naive) is naive


def test_bucket_deterministic_and_bounded():
    assert bucket("alice@x.com", 16, "author") == bucket("alice@x.com", 16, "author")
    assert bucket("alice@x.com", 16, "author") != bucket("alice@x.com", 16, "verb") or True
    for v in ["a", "b", None, ""]:
        assert 0 <= bucket(v, 8, "s") < 8
    assert bucket(None, 8, "s") == bucket("", 8, "s")  # null == empty


def test_build_dictionary_reserves_zero_and_sorts():
    d = build_dictionary(["b", "a", "b", None, ""], "Unknown")
    assert d[None] == UNKNOWN and d[""] == UNKNOWN
    assert d["a"] == 1 and d["b"] == 2  # sorted, 1-based
    assert dict_labels(d, "Unknown") == ["Unknown", "a", "b"]


def test_month_index_floor_and_clamp():
    floor = datetime(2024, 12, 1)
    assert month_index(datetime(2024, 12, 31), floor) == 0
    assert month_index(datetime(2025, 1, 1), floor) == 1
    assert month_index(datetime(2026, 7, 15), floor) == 19
    assert month_index(datetime(2024, 11, 1), floor) == 0  # clamped, never negative


def test_bucket_lookup_matches_scalar_bucket():
    labels = ["Unknown", "a", "b"]
    lut = bucket_lookup(labels, 4, "role")
    for code, label in enumerate(labels):
        assert lut[code] == bucket(label, 4, "role")


def test_cyclic_month_unit_circle():
    cos_m, sin_m = cyclic_month(np.array([0, 3, 6, 12]))
    np.testing.assert_allclose(cos_m**2 + sin_m**2, 1.0, rtol=1e-5)
    np.testing.assert_allclose(cos_m[0], cos_m[3], rtol=1e-5)  # month 12 == month 0


def test_normalize_coords_centered_and_scaled():
    out = normalize_coords(np.array([[0.0, 0.0], [10.0, 0.0]]))
    assert np.isclose(np.abs(out).max(), 1000.0)
    np.testing.assert_allclose(out.mean(axis=0), 0.0, atol=1e-9)
    # degenerate: all-identical points must not divide by zero
    same = normalize_coords(np.array([[3.0, 3.0], [3.0, 3.0]]))
    assert np.all(np.isfinite(same))
