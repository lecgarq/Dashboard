const BUCKET_LABELS = [
  "0-0 mm",
  "0-2 mm",
  "2-4 mm",
  "4-6 mm",
  "6-8 mm",
  "8-10 mm",
  "10-12 mm",
  "12-14 mm",
  "14-16 mm",
  "16-18 mm",
  "18-20 mm",
  "20-22 mm",
  "22-24 mm",
  "24-26 mm",
  "26-28 mm",
  "28-30 mm",
  "30-32 mm",
  "32-34 mm",
  "34-36 mm",
  "36-38 mm",
  "38-40 mm",
  "40-42 mm",
  "42-44 mm",
  "44-46 mm",
  "46-48 mm",
  "48-50 mm",
  ">50 mm",
];

const PURGE_DECISION_BUCKETS = BUCKET_LABELS.slice(1, 16);

const AUDIT_HEADER = [
  "Category",
  "Discipline Model",
  "Total Elements",
  "Appears in ACC Clashes",
  ...BUCKET_LABELS,
  "Actual Min Found",
  "Actual Max Found",
  "Suggested Min Tolerance",
  "Suggested Max Tolerance",
  "Dominant Purge Range",
  "Dominant Purge Range Count",
  "Purge Candidate Count",
  "Manual Review Count",
  "Manual Review Rule",
  "Notes",
];

const RAW_HEADER = [
  "Category",
  "Discipline Model",
  "Selection A",
  "Selection B",
  "Penetration Depth Range",
  "Clash Count",
  "Unit",
  "Source View",
  "Notes",
];

function bucketUpperEdge(label) {
  if (label === "0-0 mm") return 0;
  if (label === ">50 mm") return Infinity;

  const match = /^(\d+)-(\d+) mm$/.exec(label);
  if (!match) {
    throw new Error(`Unsupported tolerance bucket: ${label}`);
  }

  return Number(match[2]);
}

function asCount(value) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? count : 0;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "";
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 100) / 100);
}

function bucketTotal(counts) {
  return BUCKET_LABELS.reduce((total, label) => total + asCount(counts[label]), 0);
}

function purgeCountThrough(counts, suggestedMax) {
  if (suggestedMax == null) return 0;

  return BUCKET_LABELS.reduce((total, label) => {
    return bucketUpperEdge(label) <= suggestedMax ? total + asCount(counts[label]) : total;
  }, 0);
}

function computeStrictPurgeThreshold(counts) {
  const totalClashes = bucketTotal(counts);

  if (totalClashes === 0) {
    return {
      dominantRange: null,
      dominantRangeCount: 0,
      suggestedMin: null,
      suggestedMax: null,
      cutoffCount: 0,
      stoppedAtRange: null,
      stoppedAtCount: 0,
      purgeCandidateCount: 0,
      manualReviewCount: 0,
      manualReviewRule: "",
    };
  }

  let dominantRange = PURGE_DECISION_BUCKETS[0];
  let dominantRangeCount = asCount(counts[dominantRange]);

  for (const label of PURGE_DECISION_BUCKETS.slice(1)) {
    const count = asCount(counts[label]);
    if (count > dominantRangeCount) {
      dominantRange = label;
      dominantRangeCount = count;
    }
  }

  if (dominantRangeCount === 0) {
    const purgeCandidateCount = asCount(counts["0-0 mm"]);
    return {
      dominantRange: null,
      dominantRangeCount: 0,
      suggestedMin: 0,
      suggestedMax: 0,
      cutoffCount: 0,
      stoppedAtRange: PURGE_DECISION_BUCKETS[0],
      stoppedAtCount: 0,
      purgeCandidateCount,
      manualReviewCount: totalClashes - purgeCandidateCount,
      manualReviewRule: "> 0 mm",
    };
  }

  const dominantIndex = PURGE_DECISION_BUCKETS.indexOf(dominantRange);
  const cutoffCount = dominantRangeCount * 0.25;
  let lastIncludedRange = dominantRange;
  let stoppedAtRange = null;
  let stoppedAtCount = 0;

  for (const label of PURGE_DECISION_BUCKETS.slice(dominantIndex + 1)) {
    const count = asCount(counts[label]);
    if (count < cutoffCount) {
      stoppedAtRange = label;
      stoppedAtCount = count;
      break;
    }
    lastIncludedRange = label;
  }

  const suggestedMax = bucketUpperEdge(lastIncludedRange);
  const purgeCandidateCount = purgeCountThrough(counts, suggestedMax);
  const manualReviewCount = totalClashes - purgeCandidateCount;

  return {
    dominantRange,
    dominantRangeCount,
    suggestedMin: 0,
    suggestedMax,
    cutoffCount,
    stoppedAtRange,
    stoppedAtCount,
    purgeCandidateCount,
    manualReviewCount,
    manualReviewRule: `> ${formatNumber(suggestedMax)} mm`,
  };
}

function readCounts(row) {
  return Object.fromEntries(BUCKET_LABELS.map((label) => [label, asCount(row[label])]));
}

function baseNoteParts(notes) {
  return String(notes ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      return ![
        "Tolerance suggestions",
        "Dominant bucket",
        "Suggested max",
        ">30 mm:",
        ">50 mm:",
        "p90",
        "No clashes found",
        "Strict purge threshold",
        "Dominant purge range",
        "Purge candidates",
        "Manual review rule",
      ].some((prefix) => part.startsWith(prefix));
    });
}

function buildNotes(row, threshold) {
  const parts = baseNoteParts(row.Notes);

  if (threshold.suggestedMax == null) {
    return [...parts, "No ACC clashes found"].join("; ");
  }

  const total = threshold.purgeCandidateCount + threshold.manualReviewCount;
  const cutoff = formatNumber(threshold.cutoffCount);
  const stopText = threshold.stoppedAtRange
    ? `; stopped before ${threshold.stoppedAtRange} (${threshold.stoppedAtCount})`
    : "; scan reached 28-30 mm";

  parts.push("Strict purge threshold uses 0-30 mm buckets only");
  parts.push(
    `Dominant purge range ${threshold.dominantRange} (${threshold.dominantRangeCount}/${total}); 25% cutoff ${cutoff}${stopText}`,
  );
  parts.push(
    `Purge candidates ${threshold.purgeCandidateCount}/${total}; manual review ${threshold.manualReviewCount}/${total}`,
  );
  parts.push(`Manual review rule ${threshold.manualReviewRule}`);

  return parts.join("; ");
}

function reviseAuditRow(row) {
  const counts = readCounts(row);
  const threshold = computeStrictPurgeThreshold(counts);

  return {
    Category: row.Category ?? null,
    "Discipline Model": row["Discipline Model"] ?? null,
    "Total Elements": row["Total Elements"] ?? null,
    "Appears in ACC Clashes": row["Appears in ACC Clashes"] ?? null,
    ...counts,
    "Actual Min Found": row["Actual Min Found"] ?? null,
    "Actual Max Found": row["Actual Max Found"] ?? null,
    "Suggested Min Tolerance": threshold.suggestedMin,
    "Suggested Max Tolerance": threshold.suggestedMax,
    "Dominant Purge Range": threshold.dominantRange,
    "Dominant Purge Range Count": threshold.dominantRangeCount,
    "Purge Candidate Count": threshold.purgeCandidateCount,
    "Manual Review Count": threshold.manualReviewCount,
    "Manual Review Rule": threshold.manualReviewRule,
    Notes: buildNotes(row, threshold),
  };
}

function reviseAuditRows(rows) {
  return rows.map(reviseAuditRow);
}

function rawNoteForRange(range) {
  if (range === "0-0 mm") return "Exact zero-depth bucket from API values";
  if (range === ">50 mm") return "Open-ended issue count for depths >50 mm; not cumulative with earlier buckets";
  return "Non-cumulative 2 mm issue count for this exact range; not an average";
}

function reviseRawRow(row) {
  const range = row["Penetration Depth Range"];
  return {
    Category: row.Category ?? null,
    "Discipline Model": row["Discipline Model"] ?? null,
    "Selection A": row["Selection A"] ?? null,
    "Selection B": row["Selection B"] ?? null,
    "Penetration Depth Range": range ?? null,
    "Clash Count": asCount(row["Clash Count"]),
    Unit: row.Unit ?? "millimeters",
    "Source View": row["Source View"] ?? null,
    Notes: rawNoteForRange(range),
  };
}

function reviseRawRows(rows) {
  return rows.map(reviseRawRow);
}

function rowsToAoA(header, rows) {
  return [header, ...rows.map((row) => header.map((column) => row[column] ?? null))];
}

function auditRowsToAoA(rows) {
  return rowsToAoA(AUDIT_HEADER, rows);
}

function rawRowsToAoA(rows) {
  return rowsToAoA(RAW_HEADER, rows);
}

module.exports = {
  AUDIT_HEADER,
  BUCKET_LABELS,
  PURGE_DECISION_BUCKETS,
  RAW_HEADER,
  auditRowsToAoA,
  bucketTotal,
  computeStrictPurgeThreshold,
  rawRowsToAoA,
  reviseAuditRow,
  reviseAuditRows,
  reviseRawRow,
  reviseRawRows,
};
