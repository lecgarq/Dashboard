/**
 * Hocuspocus Yjs Server for LECG Dashboard.
 * 
 * Replaces the legacy raw y-websocket implementation with a robust, 
 * event-driven architecture using Hocuspocus.
 */

import { Server } from "@hocuspocus/server";`nimport * as Y from "yjs";
import { Database } from "@hocuspocus/extension-database";
import { Logger } from "@hocuspocus/extension-logger";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { decode } from "@auth/core/jwt";
import { existsSync } from "node:fs";

// Load .env file if it exists and we're in a supported Node version
if (typeof process.loadEnvFile === "function" && existsSync(".env")) {
  process.loadEnvFile(".env");
}

const WIKI_COLLAB_TOKEN_SALT = "wiki-collab-token";
const isProduction = process.env.NODE_ENV === "production";

function readPoolNumber(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRuntimeDatabaseUrl() {
  const pooledUrl = process.env.DATABASE_URL?.trim();
  const directUrl = process.env.DIRECT_URL?.trim();

  // Railway keeps this process alive, so prefer the session/direct URL when available.
  return isProduction ? directUrl || pooledUrl : pooledUrl || directUrl;
}

// Initialize Prisma with a proper pool for the adapter
const runtimeDatabaseUrl = getRuntimeDatabaseUrl();
if (!runtimeDatabaseUrl) {
  console.error("[hocuspocus] ERROR: DATABASE_URL / DIRECT_URL is not defined in environment.");
}
if (!process.env.AUTH_SECRET && !process.env.NEXTAUTH_SECRET) {
  console.error("[hocuspocus] ERROR: AUTH_SECRET / NEXTAUTH_SECRET is not defined in environment.");
}

const pool = new pg.Pool({
  connectionString: runtimeDatabaseUrl,
  max: readPoolNumber("PG_POOL_MAX", isProduction ? 3 : 10),
  idleTimeoutMillis: readPoolNumber("PG_IDLE_TIMEOUT_MS", isProduction ? 30_000 : 10_000),
  connectionTimeoutMillis: readPoolNumber("PG_CONNECTION_TIMEOUT_MS", 5_000),
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Extracts table type and record ID from the room name.
 * Format expected: wiki-room-clash-<ID> or wiki-room-sim-<ID>
 */
/**
 * Simple XML to HTML serializer for Tiptap fragments.
 * Maps Tiptap-specific tags to standard HTML.
 */
function serializeToHtml(xmlString) {
  return xmlString
    .replace(/<paragraph>/g, "<p>")
    .replace(/<\/paragraph>/g, "</p>")
    .replace(/<heading level="(\d)">/g, "<h\>")
    .replace(/<\/heading>/g, (match, p1, offset, string) => {
       // This is a bit naive, but Tiptap headings are usually consistent
       return "</h1>"; // Default to closing h1, refine if needed
    })
    .replace(/<bulletList>/g, "<ul>")
    .replace(/<\/bulletList>/g, "</ul>")
    .replace(/<orderedList>/g, "<ol>")
    .replace(/<\/orderedList>/g, "</ol>")
    .replace(/<listItem>/g, "<li>")
    .replace(/<\/listItem>/g, "</li>")
    .replace(/<horizontalRule\/>/g, "<hr/>")
    .replace(/<blockquote\/>/g, "<blockquote>")
    .replace(/<\/blockquote\/>/g, "</blockquote>");
}

1(name) {
  if (name.startsWith("wiki-room-clash-")) {
    return { type: "clash", id: name.replace("wiki-room-clash-", "") };
  } else if (name.startsWith("wiki-room-sim-")) {
    return { type: "sim", id: name.replace("wiki-room-sim-", "") };
  }
  return { type: "unknown", id: null };
}

const server = new Server({
  name: "WikiCollab",
  port: parseInt(process.env.PORT || "4444", 10),

  // Memory Management: Unload documents after 10 minutes of inactivity
  unloadIdleDocuments: true,
  timeout: 600000, // 10 minutes

  /**
   * Periodic Memory Monitoring and Startup Check
   */
  async onListen() {
    console.log(`[hocuspocus] Server is listening. Testing database connection...`);
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.log(`[hocuspocus] Database connection successful.`);
    } catch (err) {
      console.error(`[hocuspocus] Database connection FAILED:`, err.message);
    }

    setInterval(() => {
      const memory = process.memoryUsage();
      const heapUsed = (memory.heapUsed / 1024 / 1024).toFixed(2);
      const heapTotal = (memory.heapTotal / 1024 / 1024).toFixed(2);
      console.log(`[hocuspocus] Memory Monitor: ${heapUsed}MB / ${heapTotal}MB heap used.`);
    }, 60000); // Log every minute
  },

  /**
   * Handle Authentication using Auth.js JWTs
   */
  async onAuthenticate({ token: hookToken, documentName, request }) {
    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    
    // Fallback: y-websocket puts the token in the query string
    const url = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
    const token = hookToken || url.searchParams.get("token");

    console.log(`[hocuspocus] Attempting auth for room: ${documentName}`);
    if (!secret || !token) {
      console.warn(`[hocuspocus] Auth failed: Missing ${!secret ? "secret" : "token"} for room ${documentName}`);
      throw new Error("Unauthorized: Missing secret or token");
    }
    console.log(`[hocuspocus] Token found, decoding...`);

    try {
      console.log(`[hocuspocus] Token found, decoding (with 5s timeout)...`);
      
      // Use a Promise race to prevent decode from hanging the connection
      const payload = await Promise.race([
        decode({
          token,
          secret,
          salt: WIKI_COLLAB_TOKEN_SALT,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout: JWT decode took too long")), 5000))
      ]);

      if (!payload) {
        console.warn(`[hocuspocus] Decode returned null for room: ${documentName}`);
        throw new Error("Unauthorized: Invalid token");
      }

      const { type, id } = parseRoomDetails(documentName);
      if (type === "unknown" || !id) {
        console.warn(`[hocuspocus] Room parsing failed: ${documentName}`);
        throw new Error("Forbidden: Unknown wiki room");
      }

      console.log(`[hocuspocus] Payload details: room=${payload.room}, module=${payload.module}, sectionId=${payload.sectionId}`);

      if (payload.room !== documentName || payload.module !== type || payload.sectionId !== id) {
        console.warn(`[hocuspocus] Token payload mismatch for ${documentName}`);
        throw new Error("Forbidden: Token mismatch");
      }

      if (payload.role !== "ADMIN" && payload.role !== "EDITOR") {
        console.warn(`[hocuspocus] Insufficient role: ${payload.role}`);
        throw new Error("Forbidden: Insufficient permissions");
      }

      console.log(`[hocuspocus] Auth successful for ${documentName} (User: ${payload.email})`);
      // Return context for other hooks
      return {
        user: payload,
        wikiType: type,
        wikiId: id,
      };
    } catch (error) {
      console.error(`[hocuspocus] Auth failed for room ${documentName}:`, error.message, error.stack);
      throw error;
    }
  },

  extensions: [
    new Logger(),
    new Database({
      /**
       * Fetch document state from Prisma on first room load
       */
      fetch: async ({ documentName }) => {
        console.log(`[hocuspocus] Database fetch requested for: ${documentName}`);
        const { type, id } = parseRoomDetails(documentName);
        if (type === "unknown" || !id) {
          console.warn(`[hocuspocus] Database fetch skipped: unknown room ${documentName}`);
          return null;
        }

        try {
          console.log(`[hocuspocus] Querying Prisma for ${type}-${id}...`);
          if (type === "clash") {
            const record = await prisma.clashWiki.findUnique({ where: { id } });
            console.log(`[hocuspocus] Prisma returned ${record ? "data" : "null"} for ${type}-${id}`);
            return record?.yjsState ? new Uint8Array(record.yjsState) : null;
          } else if (type === "sim") {
            const record = await prisma.simWiki.findUnique({ where: { id } });
            console.log(`[hocuspocus] Prisma returned ${record ? "data" : "null"} for ${type}-${id}`);
            return record?.yjsState ? new Uint8Array(record.yjsState) : null;
          }
        } catch (err) {
          console.error(`[hocuspocus] Database fetch error (${type}-${id}):`, err);
        }
        return null;
      },

      /**
       * Store document state to Prisma when updates occur (debounced by Hocuspocus)
       */
            store: async ({ documentName, state }) => {
        const { type, id } = parseRoomDetails(documentName);
        if (type === "unknown" || !id) return;

        try {
          const buffer = Buffer.from(state);
          
          // Extract human-readable content from Y.Doc
          const ydoc = new Y.Doc();
          Y.applyUpdate(ydoc, state);
          // Tiptap uses an XmlFragment named 'default'
          const xmlFragment = ydoc.getXmlFragment("default");
          const xmlContent = xmlFragment.toString();`n          const content = serializeToHtml(xmlContent);

          if (type === "clash") {
            await prisma.clashWiki.update({
              where: { id },
              data: { 
                yjsState: buffer,
                content: content 
              },
            });
          } else if (type === "sim") {
            await prisma.simWiki.update({
              where: { id },
              data: { 
                yjsState: buffer,
                content: content 
              },
            });
          }
          console.log([hocuspocus] Persisted dual state for \-\);
        } catch (err) {
          console.error([hocuspocus] Database store error (\-\):, err);
        }
      },
              data: { yjsState: buffer },
            });
          } else if (type === "sim") {
            await prisma.simWiki.update({
              where: { id },
              data: { yjsState: buffer },
            });
          }
          console.log(`[hocuspocus] Persisted state for ${type}-${id}`);
        } catch (err) {
          console.error(`[hocuspocus] Database store error (${type}-${id}):`, err);
        }
      },
    }),
  ],
});

server.listen();
console.log(`[hocuspocus] Wiki Collaboration Server running on port ${process.env.PORT || 4444}`);


