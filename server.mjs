/**
 * Custom Next.js server with Socket.IO attached.
 *
 * Next.js handles all HTTP routing (pages, API routes, static assets).
 * Socket.IO intercepts /socket.io/ handshake & upgrade requests on the
 * same port, so the browser connects to the same origin — no separate
 * port or CORS configuration needed.
 *
 * Usage:
 *   node server.mjs              # dev mode (NODE_ENV !== "production")
 *   NODE_ENV=production node server.mjs   # production (run `next build` first)
 */
import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// ---- In-memory room state (server-side) ----

const MAX_MESSAGES = 200;
const DEFAULT_THEATER_MAX_USERS = 8;
const MAX_THEATER_USERS = 50;
const rooms = new Map();

function genId(len = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * 36)];
  return out;
}

function normalizeRoomMode(roomMode) {
  return roomMode === "couple" ? "couple" : "theater";
}

function normalizeMaxUsers(roomMode, maxUsers) {
  if (roomMode === "couple") return 2;
  const value = Number(maxUsers);
  if (!Number.isFinite(value)) return DEFAULT_THEATER_MAX_USERS;
  return Math.min(MAX_THEATER_USERS, Math.max(2, Math.floor(value)));
}

/**
 * Returns the host's live playback position. When the host is playing, the
 * server calculates how many seconds have elapsed since the last state
 * update and adds them to the stored currentTime. This ensures resync and
 * room:join always return an accurate position even if the host has been
 * playing without emitting any events.
 */
function getEffectiveVideoState(room) {
  const state = { ...room.videoState };
  if (state.playing && room.lastUpdateAt) {
    const elapsed = (Date.now() - room.lastUpdateAt) / 1000;
    state.currentTime += elapsed;
  }
  return state;
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Attach Socket.IO to the SAME HTTP server.
  // By default it listens on path /socket.io/.
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 1e6, // 1 MB — plenty for chat/video state payloads
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  io.on("connection", (socket) => {
    let currentRoom = null;
    const user = { socketId: socket.id, nickname: "匿名用户" };

    // ---- room:join ----
    socket.on("room:join", ({ roomId, nickname, roomMode, maxUsers }) => {
      if (currentRoom && currentRoom !== roomId) {
        socket.leave(currentRoom);
      }
      user.nickname = nickname || `匿名用户-${genId(4)}`;

      let room = rooms.get(roomId);
      if (!room) {
        const normalizedMode = normalizeRoomMode(roomMode);
        room = {
          id: roomId,
          users: new Map(),
          videoState: { url: "", playing: false, currentTime: 0 },
          messages: [],
          hostId: socket.id,
          lastUpdateAt: null,
          roomMode: normalizedMode,
          maxUsers: normalizeMaxUsers(normalizedMode, maxUsers),
        };
        rooms.set(roomId, room);
      }
      if (!room.users.has(socket.id) && room.users.size >= room.maxUsers) {
        socket.emit("room:full", { maxUsers: room.maxUsers });
        return;
      }

      currentRoom = roomId;
      socket.join(roomId);
      room.users.set(socket.id, { ...user });

      // Ack to the joiner: includes current state + recent messages.
      socket.emit("room:joined", {
        socketId: socket.id,
        roomId,
        users: Array.from(room.users.values()),
        videoState: getEffectiveVideoState(room),
        messages: room.messages.slice(-MAX_MESSAGES),
        isHost: room.hostId === socket.id,
        hostId: room.hostId,
        roomMode: room.roomMode,
        maxUsers: room.maxUsers,
      });

      // Notify everyone else in the room.
      socket.to(roomId).emit("user:joined", {
        user: { ...user },
        users: Array.from(room.users.values()),
        hostId: room.hostId,
      });
    });

    // ---- chat:send ----
    socket.on("chat:send", ({ content }) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;

      const message = {
        id: genId(),
        sender: user.nickname,
        content: (content || "").slice(0, 500),
        timestamp: Date.now(),
      };
      room.messages.push(message);
      if (room.messages.length > MAX_MESSAGES) {
        room.messages.splice(0, room.messages.length - MAX_MESSAGES);
      }

      // Broadcast to ALL clients in the room (including sender).
      io.to(currentRoom).emit("chat:message", { message });
    });

    // ---- video:state ----
    // Sync trigger: play/pause.
    // Couple rooms mirror to the other peer. Theater rooms only let the host
    // update the official reference state; members stay local-only.
    socket.on("video:state", ({ videoState }) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      if (room.roomMode === "theater" && socket.id !== room.hostId) return;
      room.videoState = { ...videoState };
      room.lastUpdateAt = videoState.playing ? Date.now() : null;
      if (room.roomMode === "couple") {
        socket.to(currentRoom).emit("video:sync-state", { videoState });
      }
    });

    // ---- video:load ----
    // Sync trigger: video switch. Couple rooms switch together. Theater rooms
    // notify members and let them decide whether to follow.
    socket.on("video:load", ({ videoState }) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      if (room.roomMode === "theater" && socket.id !== room.hostId) return;
      room.videoState = { ...videoState };
      room.lastUpdateAt = videoState.playing ? Date.now() : null;
      if (room.roomMode === "couple") {
        socket.to(currentRoom).emit("video:sync-state", { videoState });
      } else {
        socket.to(currentRoom).emit("video:change-proposal", {
          videoState,
          proposerId: socket.id,
          proposerNickname: user.nickname,
        });
      }
    });

    // ---- video:seek ----
    // Sync trigger: seek.
    socket.on("video:seek", ({ currentTime, playing }) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      if (room.roomMode === "theater" && socket.id !== room.hostId) return;
      room.videoState.currentTime = currentTime;
      room.videoState.playing = playing;
      if (playing) {
        room.lastUpdateAt = Date.now();
      } else {
        room.lastUpdateAt = null;
      }
      if (room.roomMode === "couple") {
        socket.to(currentRoom).emit("video:sync-state", {
          videoState: { ...room.videoState },
        });
      }
    });

    // ---- video:resync ----
    // Manual sync trigger. Theater members sync to host; couple users sync to
    // the other peer when present. Stored state is used as a fallback.
    socket.on("video:resync", () => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      const targetId =
        room.roomMode === "couple"
          ? Array.from(room.users.keys()).find((id) => id !== socket.id)
          : room.hostId;
      if (!targetId || targetId === socket.id) {
        socket.emit("video:sync-state", { videoState: getEffectiveVideoState(room) });
        return;
      }
      io.to(targetId).emit("video:resync-request", { memberId: socket.id });
    });

    // ---- video:resync-response ----
    // Sync source responds with its real-time player state. Server relays only
    // to the requester and updates stored state for fresher future reads.
    socket.on("video:resync-response", ({ memberId, videoState }) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      if (room.roomMode === "theater" && socket.id !== room.hostId) return;
      if (room.roomMode === "couple" && !room.users.has(socket.id)) return;
      room.videoState = { ...videoState };
      room.lastUpdateAt = videoState.playing ? Date.now() : null;
      io.to(memberId).emit("video:sync-state", { videoState });
    });

    // ---- disconnect ----
    socket.on("disconnect", () => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      room.users.delete(socket.id);

      // If host left, transfer to next remaining user.
      if (room.hostId === socket.id && room.users.size > 0) {
        const nextHostId = Array.from(room.users.keys())[0];
        room.hostId = nextHostId;
        const newHost = room.users.get(nextHostId);
        io.to(currentRoom).emit("host:changed", {
          hostId: nextHostId,
          hostNickname: newHost?.nickname || "匿名用户",
        });
      }

      socket.to(currentRoom).emit("user:left", {
        socketId: socket.id,
        users: Array.from(room.users.values()),
        hostId: room.hostId,
      });
      if (room.users.size === 0) {
        rooms.delete(currentRoom);
      }
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> SyncTube ready on http://${hostname}:${port}`);
    console.log(`> Socket.IO attached on same port (path: /socket.io/)`);
  });
});
