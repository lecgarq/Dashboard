export type ProductAccess = "administrator" | "member" | "none";

export type AccProductAccess = {
  key: string;
  access: string;
  [key: string]: unknown;
};

export type GrantOutcome = "updated" | "added" | "already" | "failed" | "skipped";

export function normalizeModelCoordinationAccess(value: string | undefined): ProductAccess {
  const normalized = (value ?? "member").trim();
  if (normalized === "administrator" || normalized === "member" || normalized === "none") {
    return normalized;
  }
  throw new Error(`Expected one of administrator, member, none for model coordination access; got "${value}"`);
}

export function mergeModelCoordinationProduct(
  products: AccProductAccess[] | null | undefined,
  access: ProductAccess,
): AccProductAccess[] {
  const next = Array.isArray(products)
    ? products
        .filter((product) => typeof product?.key === "string")
        .map((product) => ({ ...product }))
    : [];

  const existingIndex = next.findIndex((product) => product.key === "modelCoordination");
  if (existingIndex >= 0) {
    next[existingIndex] = { ...next[existingIndex], access };
  } else {
    next.push({ key: "modelCoordination", access });
  }

  const projectAdmin = next.find((product) => product.key === "projectAdministration");
  if (projectAdmin?.access === "administrator") {
    return next.map((product) => ({ ...product, access: "administrator" }));
  }

  return next;
}

export function summarizeGrantResults(results: Array<{ status: GrantOutcome }>): Record<GrantOutcome, number> {
  return results.reduce<Record<GrantOutcome, number>>(
    (summary, result) => {
      summary[result.status]++;
      return summary;
    },
    { updated: 0, added: 0, already: 0, failed: 0, skipped: 0 },
  );
}
