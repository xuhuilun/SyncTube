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
const rooms = new Map();

function genId(len = 12) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * 36)];
  return out;
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
    socket.on("room:join", ({ roomId, nickname }) => {
      if (currentRoom && currentRoom !== roomId) {
        socket.leave(currentRoom);
      }
      currentRoom = roomId;
      user.nickname = nickname || `匿名用户-${genId(4)}`;
      socket.join(roomId);

      let room = rooms.get(roomId);
      if (!room) {
        room = {
          id: roomId,
          users: new Map(),
          videoState: { url: "", playing: false, currentTime: 0 },
          messages: [],
          hostId: socket.id,
          lastUpdateAt: null,
        };
        rooms.set(roomId, room);
      }
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
    // Only host can broadcast state changes. Server stores and relays to
    // everyone EXCEPT sender (sender already applied it locally).
    socket.on("video:state", ({ videoState }) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      if (socket.id !== room.hostId) return;
      room.videoState = { ...videoState };
      room.lastUpdateAt = videoState.playing ? Date.now() : null;
      socket.to(currentRoom).emit("video:state", { videoState });
    });

    // ---- video:load ----
    // Host loaded a new URL. Update server state but do NOT relay to members.
    // Members will sync when they click "同步到房主" or when host pauses/plays/seeks.
    socket.on("video:load", ({ videoState }) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      if (socket.id !== room.hostId) return;
      room.videoState = { ...videoState };
      room.lastUpdateAt = videoState.playing ? Date.now() : null;
    });

    // ---- video:seek ----
    socket.on("video:seek", ({ currentTime, playing }) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      if (socket.id !== room.hostId) return;
      room.videoState.currentTime = currentTime;
      room.videoState.playing = playing;
      if (playing) {
        room.lastUpdateAt = Date.now();
      } else {
        room.lastUpdateAt = null;
      }
      socket.to(currentRoom).emit("video:seek", { currentTime, playing });
    });

    // ---- video:resync ----
    // Member requests current host state. Server forwards to the host, who
    // responds with its actual real-time player state. Falls back to
    // getEffectiveVideoState if the host is unavailable.
    socket.on("video:resync", () => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      if (!room.hostId || room.hostId === socket.id) {
        socket.emit("video:state", { videoState: getEffectiveVideoState(room) });
        return;
      }
      io.to(room.hostId).emit("video:resync-request", { memberId: socket.id });
    });

    // ---- video:resync-response ----
    // Host responds with its real-time player state. Server relays to the
    // requesting member and updates stored state for fresher future reads.
    socket.on("video:resync-response", ({ memberId, videoState }) => {
      if (!currentRoom) return;
      const room = rooms.get(currentRoom);
      if (!room) return;
      if (socket.id !== room.hostId) return;
      room.videoState = { ...videoState };
      room.lastUpdateAt = videoState.playing ? Date.now() : null;
      io.to(memberId).emit("video:state", { videoState });
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
