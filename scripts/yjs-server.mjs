/**
 * Hocuspocus Yjs Server for LECG Dashboard.
 * 
 * Replaces the legacy raw y-websocket implementation with a robust, 
 * event-driven architecture using Hocuspocus.
 */

import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { Logger } from "@hocuspocus/extension-logger";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { decode } from "@auth/core/jwt";

const WIKI_COLLAB_TOKEN_SALT = "wiki-collab-token";

// Initialize Prisma
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/**
 * Extracts table type and record ID from the room name.
 * Format expected: wiki-room-clash-<ID> or wiki-room-sim-<ID>
 */
function parseRoomDetails(name) {
  if (name.startsWith("wiki-room-clash-")) {
    return { type: "clash", id: name.replace("wiki-room-clash-", "") };
  } else if (name.startsWith("wiki-room-sim-")) {
    return { type: "sim", id: name.replace("wiki-room-sim-", "") };
  }
  return { type: "unknown", id: null };
}

const server = Server.configure({
  name: "WikiCollab",
  port: parseInt(process.env.PORT || "4444", 10),

  /**
   * Handle Authentication using Auth.js JWTs
   */
  async onAuthenticate({ token, documentName }) {
    const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
    if (!secret || !token) {
      throw new Error("Unauthorized: Missing secret or token");
    }

    try {
      const payload = await decode({
        token,
        secret,
        salt: WIKI_COLLAB_TOKEN_SALT,
      });

      if (!payload) throw new Error("Unauthorized: Invalid token");

      const { type, id } = parseRoomDetails(documentName);
      if (type === "unknown" || !id) {
        throw new Error("Forbidden: Unknown wiki room");
      }

      if (payload.room !== documentName || payload.module !== type || payload.sectionId !== id) {
        throw new Error("Forbidden: Token mismatch");
      }

      if (payload.role !== "ADMIN" && payload.role !== "EDITOR") {
        throw new Error("Forbidden: Insufficient permissions");
      }

      // Return context for other hooks
      return {
        user: payload,
        wikiType: type,
        wikiId: id,
      };
    } catch (error) {
      console.error(`[hocuspocus] Auth failed for room ${documentName}:`, error.message);
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
        const { type, id } = parseRoomDetails(documentName);
        if (type === "unknown" || !id) return null;

        try {
          if (type === "clash") {
            const record = await prisma.clashWiki.findUnique({ where: { id } });
            return record?.yjsState ? new Uint8Array(record.yjsState) : null;
          } else if (type === "sim") {
            const record = await prisma.simWiki.findUnique({ where: { id } });
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
          if (type === "clash") {
            await prisma.clashWiki.update({
              where: { id },
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
