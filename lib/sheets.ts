import "server-only";
import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import { db } from "@/server/db";
import { createLogger } from "@/lib/server/logger";

const logger = createLogger("sheets");

type SheetsConfig = {
  spreadsheetId?: string;
  approvedRange: string;
  pendingRange: string;
  blacklistRange: string;
};

let cachedApprovedEmails: string[] | null = null;
let cacheTime = 0;
let cachedBlacklistedEmails: string[] | null = null;
let blacklistCacheTime = 0;
let cachedSheetsClient: ReturnType<typeof google.sheets> | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function getEnvOrFallback(primary: string, fallback?: string): string | undefined {
  const direct = process.env[primary];
  if (direct && direct.trim()) return direct.trim();
  if (!fallback) return undefined;
  const legacy = process.env[fallback];
  return legacy && legacy.trim() ? legacy.trim() : undefined;
}

function getSheetsConfig(): SheetsConfig {
  return {
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    approvedRange: getEnvOrFallback("APPROVED_SHEET_RANGE", "WHITELIST_SHEET_RANGE") ?? "Approved!A:A",
    pendingRange: process.env.PENDING_SHEET_RANGE?.trim() || "Pending!A:E",
    blacklistRange: process.env.GOOGLE_SHEETS_BLACKLIST_RANGE?.trim() || "Blacklist!A:A",
  };
}

type ServiceAccountCredentials = {
  type: "service_account";
  client_email: string;
  private_key: string;
  project_id?: string;
};

async function ensureSheetExists(sheets: any, spreadsheetId: string, title: string): Promise<number | undefined> {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheet = meta.data.sheets?.find((s: any) => s.properties?.title === title);
    if (sheet) return sheet.properties?.sheetId;

    const res = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title } } }]
      }
    });
    const newId = res.data.replies?.[0]?.addSheet?.properties?.sheetId;
    logger.info("Created missing sheet tab", { title });
    return newId;
  } catch (err) {
    return undefined;
  }
}

function getStringField(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function tryParseJsonObject(raw: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function tryDecodeBase64(raw: string): string | undefined {
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    return decoded.trim() ? decoded : undefined;
  } catch {
    return undefined;
  }
}

function tryParseJsonFromFile(raw: string): Record<string, unknown> | undefined {
  const keyValue = raw.trim();
  const looksLikePath = keyValue.endsWith(".json") || keyValue.includes("/") || keyValue.includes("\\");
  if (!looksLikePath) return undefined;

  const candidatePath = path.isAbsolute(keyValue) ? keyValue : path.resolve(process.cwd(), keyValue);
  if (!fs.existsSync(candidatePath)) return undefined;

  const fileContents = fs.readFileSync(candidatePath, "utf8");
  const parsed = tryParseJsonObject(fileContents);
  if (!parsed) {
    throw new Error(`Service account file is not valid JSON: ${candidatePath}`);
  }
  return parsed;
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, "\n").trim();
}

function normalizeServiceAccountEmail(value?: string): string | undefined {
  if (!value) return undefined;
  const first = value.split(",")[0]?.trim();
  return first || undefined;
}

function resolveServiceAccountCredentials(): ServiceAccountCredentials {
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.trim();
  const fallbackClientEmail = normalizeServiceAccountEmail(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  const fallbackProjectId = getEnvOrFallback("GOOGLE_PROJECT_ID", "GOOGLE_CLOUD_ID");

  if (!rawKey) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_KEY");
  }

  const jsonCandidate = tryParseJsonObject(rawKey);
  const fileCandidate = jsonCandidate ? undefined : tryParseJsonFromFile(rawKey);
  const decodedCandidate = jsonCandidate || fileCandidate ? undefined : tryDecodeBase64(rawKey);
  const parsed = jsonCandidate ?? fileCandidate ?? (decodedCandidate ? tryParseJsonObject(decodedCandidate) : undefined);

  if (parsed) {
    if ("web" in parsed || "installed" in parsed) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is OAuth client JSON. Use a Google Service Account key JSON.");
    }

    const clientEmail = getStringField(parsed, "client_email") ?? fallbackClientEmail;
    const privateKey = getStringField(parsed, "private_key");
    const projectId = getStringField(parsed, "project_id") ?? fallbackProjectId;

    if (!clientEmail || !privateKey) {
      throw new Error("Service account JSON must include client_email and private_key");
    }

    return {
      type: "service_account",
      client_email: clientEmail,
      private_key: normalizePrivateKey(privateKey),
      project_id: projectId,
    };
  }

  if (!fallbackClientEmail) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL for split key credentials");
  }

  return {
    type: "service_account",
    client_email: fallbackClientEmail,
    private_key: normalizePrivateKey(rawKey),
    project_id: fallbackProjectId,
  };
}

async function getSheetsClient() {
  if (cachedSheetsClient) {
    return cachedSheetsClient;
  }

  const credentials = resolveServiceAccountCredentials();
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  cachedSheetsClient = google.sheets({ version: "v4", auth });
  return cachedSheetsClient;
}

async function getApprovedEmails(): Promise<string[]> {
  const now = Date.now();
  if (cachedApprovedEmails && now - cacheTime < CACHE_TTL) {
    return cachedApprovedEmails;
  }

  try {
    const sheets = await getSheetsClient();
    const { spreadsheetId, approvedRange } = getSheetsConfig();
    if (!spreadsheetId) {
      logger.warn("GOOGLE_SHEETS_ID not set — approval checks disabled");
      return [];
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: approvedRange,
    });

    const rows = response.data.values ?? [];
    const emails = Array.from(
      new Set(
        rows
          .flat()
          .map((e: string) => e?.toString().trim().toLowerCase())
          .filter(Boolean),
      ),
    );

    cachedApprovedEmails = emails;
    cacheTime = now;
    return emails;
  } catch (err) {
    logger.error("Failed to fetch approved emails from Google Sheets", { err });
    return cachedApprovedEmails ?? [];
  }
}

async function getBlacklistedEmails(): Promise<string[]> {
  const now = Date.now();
  if (cachedBlacklistedEmails && now - blacklistCacheTime < CACHE_TTL) {
    return cachedBlacklistedEmails;
  }

  try {
    const sheets = await getSheetsClient();
    const { spreadsheetId, blacklistRange } = getSheetsConfig();
    if (!spreadsheetId) {
      logger.warn("GOOGLE_SHEETS_ID not set — blacklist checks disabled");
      return [];
    }

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: blacklistRange,
    });

    const rows = response.data.values ?? [];
    const emails = Array.from(
      new Set(
        rows
          .flat()
          .map((e: string) => e?.toString().trim().toLowerCase())
          .filter(Boolean),
      ),
    );

    cachedBlacklistedEmails = emails;
    blacklistCacheTime = now;
    return emails;
  } catch (err) {
    // If the Blacklist sheet doesn't exist, we don't want to crash
    return cachedBlacklistedEmails ?? [];
  }
}





async function getPendingEmails(): Promise<string[]> {
  try {
    const sheets = await getSheetsClient();
    const { spreadsheetId, pendingRange } = getSheetsConfig();
    if (!spreadsheetId) return [];

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: pendingRange,
    });

    const rows = response.data.values ?? [];
    const emails = rows
      .map((row) => row?.[1]?.toString().trim().toLowerCase())
      .filter(Boolean) as string[];

    return Array.from(new Set(emails));
  } catch (err) {
    logger.error("Failed to fetch pending emails from Google Sheets", { err });
    return [];
  }
}



export async function isEmailApproved(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  
  // 1. Check Blacklist first
  try {
    const blacklisted = await getBlacklistedEmails();
    if (blacklisted.includes(normalized)) {
      logger.warn("Sign-in denied — email is blacklisted", { email: normalized });
      return false;
    }
  } catch { /* if sheet doesn't exist, nobody is blacklisted yet */ }

  // 2. FAST PATH: Check the local database whitelist
  const localApproval = await db.approvedEmail.findUnique({
    where: { email: normalized }
  });
  
  if (localApproval) return true;

  // 2. SLOW PATH: If not in DB, trigger a sync in the background (fire and forget)
  syncWhitelist().catch(err => logger.error("Background whitelist sync failed", { err }));

  const approved = await getApprovedEmails();
  return approved.includes(normalized);
}

async function syncWhitelist(): Promise<void> {
  const emails = await getApprovedEmails();
  if (!emails.length) return;

  for (const email of emails) {
    await db.approvedEmail.upsert({
      where: { email },
      create: { email },
      update: {}
    });
  }
}



const MODULES_LIST = ["families", "clash", "exam", "trello", "lod"];

export async function writeUserPermissionsToSheets(
  email: string,
  userId: string,
  userModules: string[],
  role: string
): Promise<void> {
  const { spreadsheetId } = getSheetsConfig();
  if (!spreadsheetId) return;

  const sheets = await getSheetsClient();
  const range = "Permissions!A:G";

  const sheetId = await ensureSheetExists(sheets, spreadsheetId, "Permissions");
  if (sheetId !== undefined) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          // Clear validation for Role (index 1) and Email (index 0) and Sync (index 6)
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startColumnIndex: 0,
                endColumnIndex: 2,
                startRowIndex: 0,
              },
              cell: {},
              fields: "dataValidation"
            }
          },
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startColumnIndex: 6,
                endColumnIndex: 7,
                startRowIndex: 0,
              },
              cell: {},
              fields: "dataValidation"
            }
          },
          // Set checkboxes for modules (index 2-6)
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startColumnIndex: 2,
                endColumnIndex: 6,
                startRowIndex: 1,
              },
              cell: {
                dataValidation: { condition: { type: "BOOLEAN" } }
              },
              fields: "dataValidation"
            }
          },
          {
            repeatCell: {
              range: {
                sheetId: sheetId,
                startColumnIndex: 2,
                endColumnIndex: 6,
                startRowIndex: 1,
              },
              cell: {
                userEnteredFormat: { horizontalAlignment: "CENTER" }
              },
              fields: "userEnteredFormat.horizontalAlignment"
            }
          }
        ]
      }
    });
  }

  let response;
  try {
    response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  } catch (err) {
    response = { data: { values: [] } };
  }
  
  const rows = response.data.values ?? [];
  const normalized = normalizeEmail(email);
  const headers = ["Email", "Role", ...MODULES_LIST.map(m => m.charAt(0).toUpperCase() + m.slice(1)), "Last Sync"];

  if (rows.length > 0) {
    const firstRow = rows[0];
    const isHeaderCorrect = firstRow?.[1] === "Role" && !firstRow.some(h => h?.toString().toLowerCase().includes("task"));
    logger.debug("Permissions sheet header check", { ok: isHeaderCorrect, colB: firstRow?.[1] });
    if (!isHeaderCorrect) {
      logger.info("Updating Permissions sheet headers", { headers: headers.join(", ") });
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Permissions!A1:G1",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [headers] },
      });
    }
  } else {
    logger.info("Permissions sheet empty — writing headers");
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Permissions!A1:G1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers] },
    });
  }
  
  const rowIndex = rows.findIndex((row) => row?.[0]?.toString().trim().toLowerCase() === normalized);
  logger.debug("Located user row in Permissions sheet", { email: normalized, rowIndex });
  const moduleChecklist = MODULES_LIST.map(m => userModules.includes(m));
  const newRow = [normalized, role, ...moduleChecklist, new Date().toISOString()];
  logger.debug("Writing permissions row", { email: normalized });

  if (rowIndex !== -1) {
    const sheetRowNumber = rowIndex + 1;
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Permissions!A${sheetRowNumber}:G${sheetRowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [newRow] },
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [newRow] },
    });
  }
}

export async function enqueuePendingUser(input: any): Promise<void> {
  const normalizedEmail = normalizeEmail(input.email);
  const approved = await getApprovedEmails();
  if (approved.includes(normalizedEmail)) return;
  const pending = await getPendingEmails();
  if (pending.includes(normalizedEmail)) return;

  const sheets = await getSheetsClient();
  const { spreadsheetId, pendingRange } = getSheetsConfig();
  if (!spreadsheetId) return;

  const title = pendingRange.split("!")[0] || "Pending";
  await ensureSheetExists(sheets, spreadsheetId, title);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: pendingRange,
    valueInputOption: "RAW",
    requestBody: {
      values: [[new Date().toISOString(), normalizedEmail, input.name?.trim() || "", input.provider, input.providerAccountId?.trim() || ""]],
    },
  });
}
