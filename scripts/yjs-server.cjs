/**
 * Yjs WebSocket server for real-time collaboration.
 * Handles sync protocol, awareness (carets/cursors) between clients,
 * and direct persistence to SQLite via Prisma.
 *
 * Usage: node scripts/yjs-server.cjs
 * Listens on 0.0.0.0:4444 by default (override with PORT env var).
 */

const http = require("http");
const { WebSocketServer } = require("ws");
const Y = require("yjs");
const syncProtocol = require("y-protocols/dist/sync.cjs");
const awarenessProtocol = require("y-protocols/dist/awareness.cjs");
const encoding = require("lib0/dist/encoding.cjs");
const decoding = require("lib0/dist/decoding.cjs");

// Import Prisma
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL,
});

const messageSync = 0;
const messageAwareness = 1;
const WIKI_COLLAB_TOKEN_SALT = "wiki-collab-token";

const PORT = parseInt(process.env.PORT || "4444", 10);

/** @type {Map<string, { doc: Y.Doc, awareness: awarenessProtocol.Awareness, conns: Set<import('ws').WebSocket>, pendingSave: boolean, type: "clash"|"sim", id: string, debounceTimer: NodeJS.Timeout | null }>} */
const rooms = new Map();

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

/**
 * Fetches the Yjs binary state from the appropriate Prisma model.
 */
async function fetchYjsStateFromPrisma(type, id) {
  try {
    if (type === "clash") {
      const record = await prisma.clashWiki.findUnique({ where: { id } });
      return record?.yjsState || null;
    } else if (type === "sim") {
      const record = await prisma.simWiki.findUnique({ where: { id } });
      return record?.yjsState || null;
    }
  } catch (err) {
    console.error(`[yjs] Error fetching Prisma state for ${type}-${id}:`, err);
  }
  return null;
}

/**
 * Saves the Yjs binary state to the appropriate Prisma model.
 */
async function saveYjsStateToPrisma(type, id, doc) {
  if (type === "unknown" || !id) return;

  try {
    const state = Y.encodeStateAsUpdate(doc);
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
    console.log(`[yjs] Saved state to DB for room (${type}-${id})`);
  } catch (err) {
    console.error(`[yjs] Error saving Prisma state for ${type}-${id}:`, err);
  }
}

async function getRoom(name) {
  let room = rooms.get(name);
  if (!room) {
    const { type, id } = parseRoomDetails(name);
    const doc = new Y.Doc();
    
    // Hydrate the CRDT state from the database if this is a known wiki room
    if (type !== "unknown" && id) {
       const existingState = await fetchYjsStateFromPrisma(type, id);
       if (existingState && existingState.byteLength > 0) {
          Y.applyUpdate(doc, new Uint8Array(existingState));
          console.log(`[yjs] Hydrated Y.Doc from DB for room: ${name}`);
       } else {
          console.log(`[yjs] Fresh Y.Doc created for room: ${name} (No DB state found)`);
       }
    } else {
       console.log(`[yjs] Room created: ${name} (Non-integrated type)`);
    }

    const awareness = new awarenessProtocol.Awareness(doc);
    awareness.setLocalState(null); // server has no local state
    
    room = { doc, awareness, conns: new Set(), pendingSave: false, type, id, debounceTimer: null };
    rooms.set(name, room);

    // Setup listener to debounce saving to database when edits happen
    doc.on('update', () => {
       if (type === "unknown" || !id) return;
       
       room.pendingSave = true;
       if (room.debounceTimer) {
         clearTimeout(room.debounceTimer);
       }
       
       // Save to DB 3 seconds after the last keystroke/update
       room.debounceTimer = setTimeout(() => {
          if (room.pendingSave) {
             saveYjsStateToPrisma(type, id, doc);
             room.pendingSave = false;
          }
       }, 3000);
    });

  }
  return room;
}

function broadcastToOthers(room, sender, message) {
  for (const conn of room.conns) {
    if (conn !== sender && conn.readyState === 1) {
      conn.send(message);
    }
  }
}

function extractAwarenessClientIds(update) {
  const decoder = decoding.createDecoder(update);
  const clients = [];
  const length = decoding.readVarUint(decoder);

  for (let index = 0; index < length; index++) {
    const clientId = decoding.readVarUint(decoder);
    clients.push(clientId);
    decoding.readVarUint(decoder);
    decoding.readVarString(decoder);
  }

  return clients;
}

async function decodeCollaborationToken(token) {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret || !token) return null;

  try {
    const { decode } = await import("@auth/core/jwt");
    return await decode({
      token,
      secret,
      salt: WIKI_COLLAB_TOKEN_SALT,
    });
  } catch (error) {
    console.error("[yjs] Failed to decode collaboration token", error);
    return null;
  }
}

async function authenticateConnection(urlObj, roomName) {
  const token = urlObj.searchParams?.get("token");
  const payload = await decodeCollaborationToken(token);
  if (!payload) {
    return { ok: false, code: 4401, reason: "Missing or invalid collaboration token" };
  }

  const { type, id } = parseRoomDetails(roomName);
  if (type === "unknown" || !id) {
    return { ok: false, code: 4403, reason: "Unknown wiki room" };
  }

  if (payload.room !== roomName || payload.module !== type || payload.sectionId !== id) {
    return { ok: false, code: 4403, reason: "Token does not match requested room" };
  }

  if (payload.role !== "ADMIN" && payload.role !== "EDITOR") {
    return { ok: false, code: 4403, reason: "Insufficient collaboration permissions" };
  }

  return { ok: true, payload };
}

function handleMessage(conn, room, data, connState) {
  const message = new Uint8Array(data);
  const decoder = decoding.createDecoder(message);
  const messageType = decoding.readVarUint(decoder);

  switch (messageType) {
    case messageSync: {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.readSyncMessage(decoder, encoder, room.doc, conn);
      const reply = encoding.toUint8Array(encoder);
      // Only send reply if it contains data beyond the message type header
      if (reply.length > 1) {
        conn.send(reply);
      }
      break;
    }
    case messageAwareness: {
      const awarenessUpdate = decoding.readVarUint8Array(decoder);
      const clientIds = extractAwarenessClientIds(awarenessUpdate);
      for (const clientId of clientIds) {
        connState.awarenessClientIds.add(clientId);
      }

      awarenessProtocol.applyAwarenessUpdate(
        room.awareness,
        awarenessUpdate,
        conn
      );
      break;
    }
  }
}

function sendSync(conn, doc) {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  conn.send(encoding.toUint8Array(encoder));
}

function sendAwareness(conn, awareness) {
  const states = awareness.getStates();
  if (states.size > 0) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(
        awareness,
        Array.from(states.keys())
      )
    );
    conn.send(encoding.toUint8Array(encoder));
  }
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("yjs-server OK");
});

const wss = new WebSocketServer({ server });

wss.on("connection", async (conn, req) => {
  // Room name from URL path, e.g. /wiki-room-clash-abc123
  // Make sure to cleanly parse the pathname just in case query params exist
  let urlObj;
  try {
     urlObj = new URL(req.url, `http://${req.headers.host}`);
  } catch(e) {
     urlObj = { pathname: req.url };
  }
  
  const roomName = (urlObj.pathname || "/").slice(1) || "default";
  const authResult = await authenticateConnection(urlObj, roomName);
  if (!authResult.ok) {
    conn.close(authResult.code, authResult.reason);
    return;
  }

  const connState = {
    awarenessClientIds: new Set(),
    auth: authResult.payload,
  };
  
  // Note: getRoom is now async to allow hydration
  const room = await getRoom(roomName);
  room.conns.add(conn);

  console.log(
    `[yjs] Client joined room "${roomName}" as ${connState.auth.sub} (${room.conns.size} client(s))`
  );

  // Relay awareness updates to other clients
  const awarenessHandler = ({ added, updated, removed }, origin) => {
    const changedClients = added.concat(updated, removed);
    if (origin !== conn) return; // only relay changes from THIS connection
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(room.awareness, changedClients)
    );
    broadcastToOthers(room, conn, encoding.toUint8Array(encoder));
  };
  room.awareness.on("update", awarenessHandler);

  // Send initial sync step 1 + existing awareness
  sendSync(conn, room.doc);
  sendAwareness(conn, room.awareness);

  conn.on("message", (data) => {
    try {
      handleMessage(conn, room, data, connState);
    } catch (err) {
      console.error("[yjs] Error handling message:", err);
    }
  });

  conn.on("close", async () => {
    room.conns.delete(conn);
    room.awareness.off("update", awarenessHandler);
    awarenessProtocol.removeAwarenessStates(
      room.awareness,
      Array.from(connState.awarenessClientIds),
      conn
    );
    console.log(
      `[yjs] Client left room "${roomName}" (${room.conns.size} client(s))`
    );

    // Clean up empty rooms after a delay
    if (room.conns.size === 0) {
      setTimeout(async () => {
        const current = rooms.get(roomName);
        if (current && current.conns.size === 0) {
          
          // Force a final save if there's arbitrary pending logic
          if (current.pendingSave) {
              if (current.debounceTimer) clearTimeout(current.debounceTimer);
              await saveYjsStateToPrisma(current.type, current.id, current.doc);
          }

          current.doc.destroy();
          rooms.delete(roomName);
          console.log(`[yjs] Room destroyed: ${roomName}`);
        }
      }, 30000);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[yjs] Yjs WebSocket server + Prisma Persistence listening on 0.0.0.0:${PORT}`);
});
