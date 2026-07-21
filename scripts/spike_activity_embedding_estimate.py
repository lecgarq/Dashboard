#!/usr/bin/env python
"""
spike_activity_embedding_estimate.py — Phase 37 SCALE-01 track (c).

Measures, on the workshop machine, what the Phase-38 EMB-07 decision needs:
  1. PaCMAP fit wall-clock on REAL AccActivityAccds samples (100k first;
     500k / 1M only if the 100k point projects each under the cap),
  2. faiss kNN projection throughput (rows/sec) for the sample-fit +
     projection alternative,
  3. labeled EXTRAPOLATIONS to the full 4,862,301-row corpus — never
     presented as measured.

Read-only: SELECT only, no writes anywhere. Results to stdout JSON + --out.

The feature matrix is a rough approximation of the Phase-38 vector (hashed
one-hot author/verb/project/objectType buckets + cyclic month + recency
scalar, ~51 dims) — runtime scaling is what's being measured, not layout
quality. Deterministic: random_state=42, fixed hash, ORDER-stable sampling.

Usage:
  python scripts/spike_activity_embedding_estimate.py [--sizes 100000,500000,1000000]
      [--cap-minutes 45] [--out path.json] [--skip-determinism]

Lineage: scripts/compute_instance_embeddings.py (DB access, seed discipline).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys
import time

import numpy as np

CORPUS_ROWS = 4_862_301  # measured 2026-07-21 census
SEED = 42
DIMS = {"author": 16, "verb": 8, "project": 16, "objectType": 8}
KNN_K = 10
HOLDOUT = 50_000


def _db_url() -> str:
    url = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    if not url:
        # Fall back to parsing .env (same source count-acc-data.cjs uses).
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        with open(env_path, "r", encoding="utf-8") as f:
            m = re.search(r'^DATABASE_URL="?([^"\n]+)"?', f.read(), re.M)
        if m:
            url = m.group(1)
    if not url:
        raise SystemExit("DIRECT_URL or DATABASE_URL must be set")
    return url


def sample_rows(n: int) -> list[tuple]:
    """TABLESAMPLE SYSTEM oversample + LIMIT; exact top-up if underfilled."""
    import psycopg

    pct = min(100.0, (n / CORPUS_ROWS) * 100.0 * 1.5)
    cols = '"userEmail", "activityVerb", "serviceGroup", "objectType", "projectId", "createdAt"'
    with psycopg.connect(_db_url()) as conn, conn.cursor() as cur:
        cur.execute(
            f'SELECT {cols} FROM "AccActivityAccds" TABLESAMPLE SYSTEM ({pct}) LIMIT {n}'
        )
        rows = cur.fetchall()
        if len(rows) < n:
            cur.execute(f'SELECT {cols} FROM "AccActivityAccds" LIMIT {n - len(rows)}')
            rows.extend(cur.fetchall())
    return rows[:n]


def _bucket(value: str | None, buckets: int, salt: str) -> int:
    h = hashlib.md5(f"{salt}:{value or ''}".encode()).digest()
    return int.from_bytes(h[:4], "little") % buckets


def build_features(rows: list[tuple]) -> np.ndarray:
    n = len(rows)
    total_dims = sum(DIMS.values()) + 3  # + cyclic month (2) + recency (1)
    x = np.zeros((n, total_dims), dtype=np.float32)
    newest = max((r[5] for r in rows if r[5] is not None), default=None)
    for i, (email, verb, _svc, otype, project, created) in enumerate(rows):
        off = 0
        for key, val in (
            ("author", email),
            ("verb", verb),
            ("project", project),
            ("objectType", otype),
        ):
            x[i, off + _bucket(val, DIMS[key], key)] = 1.0
            off += DIMS[key]
        if created is not None:
            month = created.month
            x[i, off] = math.cos(2 * math.pi * month / 12)
            x[i, off + 1] = math.sin(2 * math.pi * month / 12)
            if newest is not None:
                age_days = max(0.0, (newest - created).total_seconds() / 86_400)
                x[i, off + 2] = math.exp(-age_days / 365.0)
    return x


def peak_rss_mb() -> float | None:
    try:
        import psutil

        return round(psutil.Process().memory_info().rss / 1_048_576, 1)
    except Exception:
        return None


def fit_pacmap(x: np.ndarray) -> tuple[np.ndarray, float]:
    import pacmap

    t0 = time.perf_counter()
    emb = pacmap.PaCMAP(n_components=2, random_state=SEED).fit_transform(x)
    return emb, time.perf_counter() - t0


def checksum(emb: np.ndarray) -> str:
    return hashlib.md5(np.round(emb[:10], 5).tobytes()).hexdigest()


def project_remainder(
    sample_x: np.ndarray, sample_emb: np.ndarray, holdout_x: np.ndarray
) -> tuple[float, float]:
    """faiss kNN projection of a held-out batch; returns (rows/sec, seconds)."""
    import faiss

    index = faiss.IndexFlatL2(sample_x.shape[1])
    index.add(sample_x)
    t0 = time.perf_counter()
    dist, idx = index.search(holdout_x, KNN_K)
    w = 1.0 / (dist + 1e-6)
    w /= w.sum(axis=1, keepdims=True)
    _proj = (sample_emb[idx] * w[:, :, None]).sum(axis=1)
    secs = time.perf_counter() - t0
    return len(holdout_x) / secs, secs


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sizes", default="100000,500000,1000000")
    ap.add_argument("--cap-minutes", type=float, default=45.0)
    ap.add_argument("--out", default=None)
    ap.add_argument("--skip-determinism", action="store_true")
    args = ap.parse_args()
    sizes = [int(s) for s in args.sizes.split(",") if s.strip()]

    result: dict = {
        "seed": SEED,
        "featureDims": sum(DIMS.values()) + 3,
        "corpusRows": CORPUS_ROWS,
        "capMinutes": args.cap_minutes,
        "sampleRuns": [],
        "skipped": [],
    }

    prev: tuple[int, float] | None = None  # (n, fitSeconds)
    last_fit: tuple[np.ndarray, np.ndarray] | None = None  # (features, embedding)

    for n in sizes:
        if prev is not None:
            # Superlinear projection from the last measured point (n log n basis).
            pn, ps = prev
            projected = ps * (n / pn) * (math.log(n) / math.log(pn))
            if projected > args.cap_minutes * 60:
                result["skipped"].append(
                    {
                        "n": n,
                        "reason": f"projected {round(projected / 60, 1)} min from the "
                        f"{pn} run exceeds cap {args.cap_minutes} min",
                        "label": "extrapolation",
                    }
                )
                continue
        print(f"[spike-embed] sampling {n} rows…", file=sys.stderr, flush=True)
        t0 = time.perf_counter()
        rows = sample_rows(n)
        sample_secs = time.perf_counter() - t0
        x = build_features(rows)
        print(f"[spike-embed] fitting PaCMAP n={n}…", file=sys.stderr, flush=True)
        emb, fit_secs = fit_pacmap(x)
        run: dict = {
            "n": n,
            "sampleSeconds": round(sample_secs, 1),
            "fitSeconds": round(fit_secs, 1),
            "peakRssMb": peak_rss_mb(),
            "checksum": checksum(emb),
        }
        if n == sizes[0] and not args.skip_determinism and fit_secs < 20 * 60:
            emb2, _ = fit_pacmap(x)
            run["determinism"] = "identical" if checksum(emb2) == checksum(emb) else "MISMATCH"
        elif n == sizes[0]:
            run["determinism"] = "skipped (flag or >20min fit)"
        result["sampleRuns"].append(run)
        prev = (n, fit_secs)
        last_fit = (x, emb)

    if last_fit is not None:
        x, emb = last_fit
        hold = min(HOLDOUT, len(x) // 2)
        print(f"[spike-embed] faiss projection of {hold} held-out rows…", file=sys.stderr, flush=True)
        rows_per_sec, secs = project_remainder(x[hold:], emb[hold:], x[:hold])
        remainder = CORPUS_ROWS - len(x)
        result["projection"] = {
            "sampleN": len(x) - hold,
            "holdoutN": hold,
            "k": KNN_K,
            "measuredSeconds": round(secs, 2),
            "rowsPerSec": round(rows_per_sec),
            "estRemainderMinutes": round(remainder / rows_per_sec / 60, 1),
            "estRemainderLabel": "extrapolation from measured rows/sec",
        }

    if prev is not None:
        pn, ps = prev
        est = ps * (CORPUS_ROWS / pn) * (math.log(CORPUS_ROWS) / math.log(pn))
        result["fullFitEstimate"] = {
            "basis": f"n log n scaling from measured n={pn} ({round(ps, 1)}s)",
            "estMinutes": round(est / 60, 1),
            "label": "extrapolation — NOT a measured figure",
        }

    out = json.dumps(result, indent=2)
    print(out)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(out)


if __name__ == "__main__":
    main()
