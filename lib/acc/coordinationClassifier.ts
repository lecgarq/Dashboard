/**
 * Pure classifier: is an ACC issue a Model-Coordination clash issue?
 * Title rule (language-proof) → description rule (English auto-text) → none.
 * No I/O. The authoritative net is Pass 2 (clash endpoint), not this file.
 */
const TITLE_CLASH_RE = /\[(\d+)\]\s*$/; // any trailing [number]
const DESC_LEAD_RE = /^\s*\d+\s+clash(?:es)?\s+between\b/i; // "1 clash between …"
const DESC_BETWEEN_RE = /\bclash(?:es)?\s+between\b[\s\S]*?\band\b/i; // "clash between … and …"
const MODEL_VIEW_RE = /-\s*\{\s*3D\s*-\s*[^}]+\}/gi; // " - {3D - user}"

export interface CoordinationVerdict {
  isCoordination: boolean;
  source: "title" | "description" | null;
  clashId: string | null;
  confidence: "high" | "medium" | "low" | null;
}

export function classifyCoordination(input: {
  title?: string | null;
  description?: string | null;
}): CoordinationVerdict {
  const t = TITLE_CLASH_RE.exec((input.title ?? "").trim());
  if (t) {
    const confidence = t[1].length >= 4 ? "high" : "low";
    return { isCoordination: true, source: "title", clashId: t[1], confidence };
  }
  const d = input.description ?? "";
  if (DESC_LEAD_RE.test(d)) {
    return { isCoordination: true, source: "description", clashId: null, confidence: "high" };
  }
  if (DESC_BETWEEN_RE.test(d) && (d.match(MODEL_VIEW_RE) ?? []).length >= 2) {
    return { isCoordination: true, source: "description", clashId: null, confidence: "medium" };
  }
  return { isCoordination: false, source: null, clashId: null, confidence: null };
}
