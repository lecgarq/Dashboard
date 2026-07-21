"""Full-corpus activity-event 2D embedding — v2.7 Phase 38 (EMB-07).

Reads the UNIFIED activity corpus straight from PostgreSQL (AccActivityAccds in
full + AccActivity rows kept by the mergeActivitySources boundary: no/empty
project, project without accds coverage, or createdAt before the per-project
accds start — mirrors UNIFIED_ACTIVITY_CTE in lib/server/unifiedActivitySource.ts,
including its id convention: 'accds:'+accdsActivityId vs plain AccActivity.id),
builds a hashed one-hot author+event feature matrix (author role/company/modules
joined from the 38-01 sidecar so the author's properties literally shape the
layout), full-fit PaCMAPs the whole corpus (owner decision: full fit, seed 42),
proves determinism twice, runs the quality gate, then TRUNCATE+COPYs positions
and dictionary codes into AccActivityEmbedding.

Fallback clause (owner decision, 38-CONTEXT): fit wall-clock > --cap-minutes
(default 90) or peak RSS > --cap-rss-gb (default 12) aborts BEFORE any write.

Artifacts (all under gitignored .embedding/):
  activity-universe-dicts.json     — dictionary labels for every code column
  activity-embedding-gate.json     — trustworthiness baseline (EMB-05 discipline)

Usage:
  python scripts/compute_activity_embeddings.py            # full run + write
  python scripts/compute_activity_embeddings.py --limit 50000   # smoke, NO write

Pure functions are unit-tested in test_compute_activity_embeddings.py.
Lineage: compute_instance_embeddings.py (gate/write discipline),
spike_activity_embedding_estimate.py (hashed features, DB access, seed).
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
import uuid
from datetime import datetime, timezone

import numpy as np

RANDOM_STATE = 42
HALF_EXTENT = 1000.0
TRUST_SAMPLE = 5000
TRUST_K = 10
# Hashed one-hot block widths (spike lineage, bounded total dims).
DIMS = {
    "author": 16,
    "verb": 8,
    "project": 16,
    "objectType": 8,
    "folder": 8,
    "role": 4,
    "company": 4,
    "modules": 4,  # multi-hot
}
EXTRA_DIMS = 3  # cyclic month (2) + recency (1)
UNKNOWN = 0  # code 0 = Unknown/none in every dictionary


# ---------------------------------------------------------------- pure helpers

def bucket(value: str | None, buckets: int, salt: str) -> int:
    """Deterministic hash bucket (md5, spike lineage)."""
    h = hashlib.md5(f"{salt}:{value or ''}".encode()).digest()
    return int.from_bytes(h[:4], "little") % buckets


def build_dictionary(values, zero_label: str) -> dict:
    """Sorted distinct values -> codes starting at 1; 0 reserved for zero_label."""
    out = {None: UNKNOWN, "": UNKNOWN}
    for i, v in enumerate(sorted({v for v in values if v})):
        out[v] = i + 1
    out["__zero__"] = zero_label
    return out


def dict_labels(d: dict, zero_label: str) -> list[str]:
    """Code-indexed label list for the payload meta."""
    inv = {}
    for k, v in d.items():
        if k in ("__zero__", None, "") or not isinstance(v, int):
            continue
        inv[v] = k
    return [zero_label] + [inv[i] for i in sorted(inv)]


def month_index(created: datetime, floor: datetime) -> int:
    """Whole months since the corpus floor (>=0)."""
    return max(0, (created.year - floor.year) * 12 + (created.month - floor.month))


def bucket_lookup(labels: list[str], width: int, salt: str) -> np.ndarray:
    """Per-code hash-bucket lookup array (code -> bucket)."""
    return np.array([bucket(v, width, salt) for v in labels], dtype=np.int64)


def cyclic_month(months: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    ang = 2 * np.pi * (months % 12) / 12.0
    return np.cos(ang).astype(np.float32), np.sin(ang).astype(np.float32)


def normalize_coords(xy: np.ndarray, half_extent: float = HALF_EXTENT) -> np.ndarray:
    xy = np.asarray(xy, dtype=np.float64)
    xy = xy - xy.mean(axis=0, keepdims=True)
    max_abs = float(np.max(np.abs(xy))) or 1.0
    return xy * (half_extent / max_abs)


# --------------------------------------------------------------------- DB I/O

def _db_url() -> str:
    url = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    if not url:
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        with open(env_path, "r", encoding="utf-8") as f:
            m = re.search(r'^DATABASE_URL="?([^"\n]+)"?', f.read(), re.M)
        if m:
            url = m.group(1)
    if not url:
        raise SystemExit("DIRECT_URL or DATABASE_URL must be set")
    return url


# The DC-side keep filter — verbatim semantics of UNIFIED_ACTIVITY_CTE.
DC_KEEP_SQL = """
  FROM "AccActivity" d
  LEFT JOIN (
    SELECT "projectId", MIN("createdAt") AS s
    FROM "AccActivityAccds" GROUP BY "projectId"
  ) a ON a."projectId" = d."projectId"
  WHERE d."projectId" IS NULL
     OR d."projectId" = ''
     OR a.s IS NULL
     OR d."createdAt" < a.s
"""

ACCDS_SELECT = (
    'SELECT (\'accds:\' || "accdsActivityId"), "userEmail", "projectId", '
    '"activityVerb", "serviceGroup", "objectType", "folderId", "createdAt" '
    'FROM "AccActivityAccds"'
)
DC_SELECT = (
    'SELECT d.id, d."userEmail", d."projectId", d."rawAction", d.service, '
    "NULL, NULL, d.\"createdAt\"" + DC_KEEP_SQL
)


def stream_corpus(conn, limit: int | None):
    """Yield unified rows (id, email, project, verb, service, otype, folder, created)."""
    n = 0
    for select in (ACCDS_SELECT, DC_SELECT):
        with conn.cursor(name=f"corpus_{n}") as cur:
            cur.itersize = 100_000
            cur.execute(select)
            for row in cur:
                yield row
                n += 1
                if limit is not None and n >= limit:
                    return


def sql_corpus_count(conn) -> int:
    with conn.cursor() as cur:
        cur.execute('SELECT COUNT(*) FROM "AccActivityAccds"')
        accds = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*)" + DC_KEEP_SQL)
        dc = cur.fetchone()[0]
    return int(accds) + int(dc)


def peak_rss_mb() -> float | None:
    try:
        import psutil

        info = psutil.Process().memory_info()
        return round(getattr(info, "peak_wset", info.rss) / 1_048_576, 1)
    except Exception:
        return None


# ------------------------------------------------------------------- pipeline

def load_sidecar(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return {(r["emailLower"], r["projectId"]): r for r in data["rows"]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None,
                    help="smoke-test row cap — NEVER writes to the DB")
    ap.add_argument("--cap-minutes", type=float, default=90.0)
    ap.add_argument("--cap-rss-gb", type=float, default=12.0)
    args = ap.parse_args()
    smoke = args.limit is not None

    import psycopg

    t0 = time.time()
    emb_dir = os.path.join(os.getcwd(), ".embedding")
    sidecar = load_sidecar(os.path.join(emb_dir, "activity-author-attributes.json"))
    print(f"sidecar: {len(sidecar)} (email, project) attribute rows")

    conn = psycopg.connect(_db_url())
    expected = sql_corpus_count(conn)
    print(f"unified corpus count (SQL): {expected}")

    # Cross-check against the 38-01 coverage figure (measured via the real
    # unified CTE through countUnifiedActivityRows) — drift means the boundary
    # replication above no longer matches lib/server/unifiedActivitySource.ts.
    cov_path = os.path.join(emb_dir, "activity-author-coverage.json")
    if os.path.exists(cov_path) and not smoke:
        with open(cov_path, "r", encoding="utf-8") as f:
            cov_total = json.load(f)["total"]
        if cov_total != expected:
            raise SystemExit(
                f"boundary drift: SQL count {expected} != coverage total {cov_total}")

    # ---- pass 1: stream rows into python-side columns --------------------
    ids: list[str] = []
    emails: list[str | None] = []
    projects: list[str | None] = []
    verbs: list[str] = []
    services: list[str | None] = []
    otypes: list[str | None] = []
    folders: list[str | None] = []
    createds: list[datetime] = []
    for (rid, email, project, verb, service, otype, folder, created) in stream_corpus(conn, args.limit):
        ids.append(rid)
        emails.append(email.lower() if email else None)
        projects.append(project or None)
        verbs.append(verb)
        services.append(service or None)
        otypes.append(otype or None)
        folders.append(folder or None)
        createds.append(created)
    n = len(ids)
    print(f"streamed {n} rows in {time.time() - t0:.1f}s")
    if not smoke and n != expected:
        raise SystemExit(f"streamed {n} != SQL count {expected}")
    if n == 0:
        raise SystemExit("empty corpus")

    # ---- dictionaries (deterministic, sorted; 0 = Unknown/none) ----------
    roles = sorted({r["role"] for r in sidecar.values() if r["role"]})
    companies = sorted({r["company"] for r in sidecar.values() if r["company"]})
    d_verb = build_dictionary(verbs, "(none)")
    d_otype = build_dictionary(otypes, "(none)")
    d_module = build_dictionary(services, "(none)")
    d_project = build_dictionary(projects, "(none)")
    d_author = build_dictionary(emails, "Unknown author")
    d_folder = build_dictionary(folders, "(none)")
    d_role = build_dictionary(roles, "Unknown")
    d_company = build_dictionary(companies, "Unknown")
    floor = min(createds)
    max_month = max(month_index(c, floor) for c in createds)

    labels = {
        "verb": dict_labels(d_verb, "(none)"),
        "objectType": dict_labels(d_otype, "(none)"),
        "module": dict_labels(d_module, "(none)"),
        "project": dict_labels(d_project, "(none)"),
        "author": dict_labels(d_author, "Unknown author"),
        "role": dict_labels(d_role, "Unknown"),
        "company": dict_labels(d_company, "Unknown"),
        "monthFloor": floor.strftime("%Y-%m"),
        "monthCount": max_month + 1,
        # folders: int codes only, no label dictionary (132k folders; names on-demand)
        "folderCount": len(d_folder) - 2,
    }
    for name, cap in (("verb", 32767), ("objectType", 32767), ("module", 32767),
                      ("role", 32767), ("company", 32767)):
        if len(labels[name]) > cap:
            raise SystemExit(f"dictionary {name} exceeds smallint")

    # ---- code arrays ------------------------------------------------------
    code_verb = np.array([d_verb[v] for v in verbs], dtype=np.int32)
    code_otype = np.array([d_otype.get(v, UNKNOWN) for v in otypes], dtype=np.int32)
    code_module = np.array([d_module.get(v, UNKNOWN) for v in services], dtype=np.int32)
    code_project = np.array([d_project.get(v, UNKNOWN) for v in projects], dtype=np.int32)
    code_author = np.array([d_author.get(v, UNKNOWN) for v in emails], dtype=np.int32)
    code_folder = np.array([d_folder.get(v, UNKNOWN) for v in folders], dtype=np.int32)
    code_month = np.array([month_index(c, floor) for c in createds], dtype=np.int32)
    code_role = np.zeros(n, dtype=np.int32)
    code_company = np.zeros(n, dtype=np.int32)
    pair_role = {}
    pair_company = {}
    pair_modules = {}
    for (e, p), r in sidecar.items():
        pair_role[(e, p)] = d_role.get(r["role"], UNKNOWN)
        pair_company[(e, p)] = d_company.get(r["company"], UNKNOWN)
        pair_modules[(e, p)] = sorted({bucket(m, DIMS["modules"], "modules") for m in r["modules"]})
    mod_buckets: list[tuple[int, ...]] = [()] * n
    for i in range(n):
        key = (emails[i], projects[i])
        if key in pair_role:
            code_role[i] = pair_role[key]
            code_company[i] = pair_company[key]
            mod_buckets[i] = tuple(pair_modules[key])
    newest = max(createds)
    age_days = np.array(
        [(newest - c).total_seconds() / 86_400 for c in createds], dtype=np.float32)
    del emails, projects, verbs, services, otypes, folders

    # ---- feature matrix (hashed one-hot blocks + cyclic month + recency) --
    total_dims = sum(DIMS.values()) + EXTRA_DIMS
    x = np.zeros((n, total_dims), dtype=np.float32)
    rows_idx = np.arange(n)
    off = 0
    for name, codes, lbls in (
        ("author", code_author, labels["author"]),
        ("verb", code_verb, labels["verb"]),
        ("project", code_project, labels["project"]),
        ("objectType", code_otype, labels["objectType"]),
        ("folder", code_folder, None),
        ("role", code_role, labels["role"]),
        ("company", code_company, labels["company"]),
    ):
        width = DIMS[name]
        if lbls is None:  # folder: bucket the raw code (labels not materialized)
            lut = np.array([bucket(str(c) if c else None, width, name)
                            for c in range(int(code_folder.max()) + 1)], dtype=np.int64)
        else:
            lut = bucket_lookup(lbls, width, name)
        x[rows_idx, off + lut[codes]] = 1.0
        off += width
    for i, buckets_ in enumerate(mod_buckets):
        for b in buckets_:
            x[i, off + b] = 1.0
    off += DIMS["modules"]
    cos_m, sin_m = cyclic_month(code_month)
    x[:, off] = cos_m
    x[:, off + 1] = sin_m
    x[:, off + 2] = np.exp(-age_days / 365.0)
    print(f"feature matrix {x.shape} ({x.nbytes / 1_048_576:.0f} MB) "
          f"in {time.time() - t0:.1f}s")

    # ---- full fit ×2 (determinism), caps, gate ---------------------------
    import pacmap

    def fit() -> tuple[np.ndarray, float]:
        t = time.perf_counter()
        emb = pacmap.PaCMAP(n_components=2, random_state=RANDOM_STATE).fit_transform(x)
        return np.asarray(emb, dtype=np.float64), time.perf_counter() - t

    emb1, fit1_s = fit()
    rss = peak_rss_mb()
    print(f"fit#1: {fit1_s / 60:.1f} min, peak RSS {rss} MB")
    if fit1_s > args.cap_minutes * 60:
        raise SystemExit(
            f"FALLBACK CLAUSE: fit {fit1_s / 60:.1f} min exceeds cap "
            f"{args.cap_minutes} min — NOT writing; pivot to sample-fit + IVF/HNSW "
            "(owner checkpoint required)")
    if rss is not None and rss > args.cap_rss_gb * 1024:
        raise SystemExit(
            f"FALLBACK CLAUSE: peak RSS {rss} MB exceeds cap {args.cap_rss_gb} GB "
            "— NOT writing; pivot per 38-CONTEXT decision 1")

    emb2, fit2_s = fit()
    identical = bool(np.array_equal(emb1, emb2))
    print(f"fit#2: {fit2_s / 60:.1f} min — determinism: "
          f"{'identical' if identical else 'MISMATCH'}")
    if not identical:
        raise SystemExit("determinism MISMATCH — NOT writing")

    coords = normalize_coords(emb1)
    if not np.all(np.isfinite(coords)):
        raise SystemExit("non-finite coordinates — NOT writing")

    from sklearn.manifold import trustworthiness

    rng = np.random.RandomState(RANDOM_STATE)
    sample = rng.choice(n, min(TRUST_SAMPLE, n), replace=False)
    trust = float(trustworthiness(x[sample], coords[sample],
                                  n_neighbors=TRUST_K, metric="cosine"))
    gate_path = os.path.join(emb_dir, "activity-embedding-gate.json")
    if os.path.exists(gate_path) and not smoke:
        with open(gate_path, "r", encoding="utf-8") as f:
            baseline = json.load(f)["trustworthiness"]
        print(f"trustworthiness(k={TRUST_K}): baseline={baseline:.4f} new={trust:.4f}")
        if trust < baseline - 1e-9:
            raise SystemExit("GATE FAIL: trustworthiness below stored baseline — NOT writing")
        print("GATE PASS: new >= baseline.")
    else:
        print(f"trustworthiness(k={TRUST_K}) first-run baseline: {trust:.4f}")

    run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"

    if smoke:
        print(f"SMOKE RUN (--limit {args.limit}): no DB write, no artifact overwrite. "
              f"Would write {n} rows, run {run_id}.")
        return

    # ---- persist dictionaries + gate baseline (post-gate, pre-COPY) -------
    with open(os.path.join(emb_dir, "activity-universe-dicts.json"), "w", encoding="utf-8") as f:
        json.dump(labels, f)
    with open(gate_path, "w", encoding="utf-8") as f:
        json.dump({"trustworthiness": trust, "k": TRUST_K, "sample": int(len(sample)),
                   "runId": run_id, "measuredAt": datetime.now(timezone.utc).isoformat()}, f)

    # ---- TRUNCATE + COPY in one transaction ------------------------------
    t_w = time.time()
    with conn.transaction():
        with conn.cursor() as cur:
            cur.execute('TRUNCATE "AccActivityEmbedding"')
            cols = ('id,x,y,"verbId","objectTypeId","moduleId","monthId","roleId",'
                    '"companyId","projectId","authorId","folderId","embeddingRunId"')
            with cur.copy(f'COPY "AccActivityEmbedding" ({cols}) FROM STDIN') as copy:
                for i in range(n):
                    copy.write_row((
                        ids[i], float(coords[i, 0]), float(coords[i, 1]),
                        int(code_verb[i]), int(code_otype[i]), int(code_module[i]),
                        int(code_month[i]), int(code_role[i]), int(code_company[i]),
                        int(code_project[i]), int(code_author[i]), int(code_folder[i]),
                        run_id,
                    ))
    with conn.cursor() as cur:
        cur.execute('SELECT COUNT(*) FROM "AccActivityEmbedding"')
        written = cur.fetchone()[0]
    conn.close()
    print(f"COPY wrote {written} rows in {time.time() - t_w:.1f}s "
          f"(run {run_id})")
    if written != n:
        raise SystemExit(f"post-write count {written} != {n}")
    print(f"DONE: {n} rows, fit {fit1_s / 60:.1f}+{fit2_s / 60:.1f} min, "
          f"peak RSS {peak_rss_mb()} MB, total {(time.time() - t0) / 60:.1f} min")


if __name__ == "__main__":
    main()
