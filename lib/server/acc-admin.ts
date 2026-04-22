import "server-only";

import { IntegrationError } from "@/lib/server/integration-errors";

const HQ_ADMIN_BASE = "https://developer.api.autodesk.com/hq/v1";

export type AccUser = {
  id: string;
  email: string;
  name: string;
  status: string;
  role: string;
};

export type AccRole = {
  id: string;
  name: string;
  roleGroupId?: string;
};

export type AccProject = {
  id: string;
  name: string;
  status: string;
  roles: AccRole[];
};

export type AccProduct = {
  id: string;
  name: string;
  status: string;
  projectIds: string[];
};

function getString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

async function fetchHqUsers(
  url: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>[]> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    signal,
  });

  const raw = await response.text();

  if (!response.ok) {
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { /* ignore */ }

    const errorText =
      getString(payload.developerMessage) ||
      getString(payload.detail) ||
      raw ||
      `${response.status} ${response.statusText}`;

    if (response.status === 401) {
      throw new IntegrationError(
        "Autodesk connection expired. Reconnect Autodesk and try again.",
        response.status,
        "reconnect_required",
        "Autodesk",
        { url, error: errorText }
      );
    }
    if (response.status === 403) {
      throw new IntegrationError(
        "Account Admin privileges required. Ensure the APS app is provisioned in your ACC account.",
        response.status,
        "forbidden",
        "Autodesk",
        { url, error: errorText }
      );
    }
    throw new IntegrationError(
      `APS request failed: ${errorText}`,
      response.status,
      "unavailable",
      "Autodesk",
      { url, error: errorText }
    );
  }

  try {
    const data = JSON.parse(raw) as unknown;
    return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  } catch {
    return [];
  }
}

export async function fetchAccUserByEmail(
  accountId: string,
  email: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<AccUser | null> {
  const baseUrl = `${HQ_ADMIN_BASE}/accounts/${accountId}/users`;
  const limit = 100;
  let offset = 0;
  const maxUsers = 5000;

  while (offset < maxUsers) {
    const url = `${baseUrl}?limit=${limit}&offset=${offset}`;
    const users = await fetchHqUsers(url, accessToken, signal);

    const match = users.find((u) => u.email === email);
    if (match) {
      return {
        id: getString(match.id),
        email: getString(match.email),
        name: getString(match.name),
        status: getString(match.status),
        role: getString(match.role) || getString(match.access_level) || "user",
      };
    }

    if (users.length < limit) return null;
    offset += limit;
  }

  return null;
}

// HQ v1 does not expose per-user project or product listings.
export async function fetchAccUserProjects(
  _accountId: string,
  _userId: string,
  _accessToken: string,
  _signal?: AbortSignal
): Promise<AccProject[]> {
  return [];
}

export async function fetchAccUserProducts(
  _accountId: string,
  _userId: string,
  _accessToken: string,
  _signal?: AbortSignal
): Promise<AccProduct[]> {
  return [];
}
