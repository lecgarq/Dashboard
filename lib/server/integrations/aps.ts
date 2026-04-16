import { AuthenticationClient, Scopes } from "@aps_sdk/authentication";
import { OssClient, Region } from "@aps_sdk/oss";
import { ModelDerivativeClient, View } from "@aps_sdk/model-derivative";
import { createLogger } from "@/lib/server/logger";

const logger = createLogger("aps");

const APS_CLIENT_ID = process.env.APS_CLIENT_ID!;
const APS_CLIENT_SECRET = process.env.APS_CLIENT_SECRET!;
const BUCKET_KEY = "bim_dashboard_families_" + APS_CLIENT_ID.toLowerCase().substring(0, 8);

const authClient = new AuthenticationClient();
const ossClient = new OssClient();
const derivativeClient = new ModelDerivativeClient();

export async function getInternalToken() {
  const credentials = await authClient.getTwoLeggedToken(APS_CLIENT_ID, APS_CLIENT_SECRET, [
    Scopes.DataRead,
    Scopes.DataWrite,
    Scopes.DataCreate,
    Scopes.ViewablesRead,
  ]);
  return credentials.access_token!;
}

async function ensureBucketExists() {
  const token = await getInternalToken();
  try {
    await ossClient.getBucketDetails(BUCKET_KEY, { accessToken: token });
  } catch (err) {
    // Create bucket if it doesn't exist
    await ossClient.createBucket(Region.Us, { bucketKey: BUCKET_KEY, policyKey: "persistent" }, { accessToken: token });
  }
}

export async function uploadToAps(fileName: string, buffer: Buffer) {
  const token = await getInternalToken();
  await ensureBucketExists();
  
  const objectDetails = await ossClient.uploadObject(BUCKET_KEY, fileName, buffer, {
    accessToken: token,
  });
  
  // Return the URN (base64 encoded)
  const id = objectDetails.objectId!;
  return Buffer.from(id).toString("base64").replace(/=/g, "").replace(/\//g, "_").replace(/\+/g, "-");
}

export async function translateToSvf2(urn: string) {
  const token = await getInternalToken();
  try {
    await derivativeClient.startJob({
      input: { urn },
      output: {
        formats: [{ type: "svf2", views: [View._2d, View._3d] }]
      }
    }, { accessToken: token });
    return true;
  } catch (err) {
    logger.error("APS translation failed", { urn, err });
    return false;
  }
}

export async function getManifest(urn: string) {
  const token = await getInternalToken();
  try {
    const manifest: any = await derivativeClient.getManifest(urn, { accessToken: token });
    return manifest;
  } catch (err) {
    return null;
  }
}

// ── Data Management API helpers ──────────────────────────────────────────────

const DM_BASE = "https://developer.api.autodesk.com";

export type ApsFolder = { id: string; name: string; type: "folders" };
export type ApsItem   = { id: string; name: string; type: "items"; extension: string; derivativeUrn?: string };

// Module-level cache for hub id (cleared on restart)
let cachedHubId: string | null | undefined = undefined;

export async function getFirstHub(): Promise<{ id: string; name: string } | null> {
  if (cachedHubId !== undefined) {
    return cachedHubId ? { id: cachedHubId, name: "" } : null;
  }
  const token = await getInternalToken();
  const res = await fetch(`${DM_BASE}/project/v1/hubs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) { cachedHubId = null; return null; }
  const json = await res.json();
  const hub = json?.data?.[0];
  if (!hub) { cachedHubId = null; return null; }
  cachedHubId = hub.id;
  return { id: hub.id, name: hub.attributes?.name ?? "" };
}

export async function getProjectTopFolders(hubId: string, projectId: string): Promise<ApsFolder[]> {
  const token = await getInternalToken();
  const res = await fetch(
    `${DM_BASE}/project/v1/hubs/${encodeURIComponent(hubId)}/projects/${encodeURIComponent(projectId)}/topFolders`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return [];
  const json = await res.json();
  return (json?.data ?? [])
    .filter((d: any) => d.type === "folders")
    .map((d: any) => ({ id: d.id, name: d.attributes?.displayName ?? d.attributes?.name ?? d.id, type: "folders" as const }));
}

export async function getFolderContents(projectId: string, folderId: string): Promise<{ folders: ApsFolder[]; items: ApsItem[] }> {
  const token = await getInternalToken();
  const res = await fetch(
    `${DM_BASE}/data/v1/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(folderId)}/contents`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return { folders: [], items: [] };
  const json = await res.json();
  const data: any[] = json?.data ?? [];

  const folders: ApsFolder[] = data
    .filter((d) => d.type === "folders")
    .map((d) => ({ id: d.id, name: d.attributes?.displayName ?? d.attributes?.name ?? d.id, type: "folders" as const }));

  const items: ApsItem[] = data
    .filter((d) => d.type === "items")
    .map((d) => {
      const name: string = d.attributes?.displayName ?? d.attributes?.name ?? d.id;
      const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
      return { id: d.id, name, type: "items" as const, extension: ext };
    });

  return { folders, items };
}

export async function getItemDerivativeUrn(projectId: string, itemId: string): Promise<string | null> {
  const token = await getInternalToken();
  const res = await fetch(
    `${DM_BASE}/data/v1/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const json = await res.json();
  const storageId: string | undefined = json?.data?.relationships?.storage?.data?.id;
  if (!storageId) return null;
  // base64url-encode the storage ID to produce the derivative URN
  return Buffer.from(storageId).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
