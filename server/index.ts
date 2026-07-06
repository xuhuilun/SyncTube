/**
 * 参考实现：真实 Socket.IO 服务端。
 *
 * 当你准备好从 mock 切换到真实后端时，用这个文件启动一个独立的
 * Node 服务（部署到 Render / Fly.io / VPS），或附着到 Next.js 自定义 server。
 * 事件名与 payload 与 src/types/index.ts 完全对齐。
 *
 * 运行：
 *   npm install socket.io
 *   npx tsx server/index.ts
 */
import { createServer } from "http";
import { Server } from "socket.io";

interface OnlineUser { socketId: string; nickname: string; }
interface ChatMessage { id: string; sender: string; content: string; timestamp: number; }
interface VideoState { url: string; playing: boolean; currentTime: number; }
interface Room {
  roomId: string;
  users: Map<string, OnlineUser>;
  videoState: VideoState;
  messages: ChatMessage[];
  hostId: string;
  roomMode: "couple" | "theater";
  maxUsers: number;
}

const MAX_MESSAGES = 200;
const rooms = new Map<string, Room>();

function getRoom(id: string): Room {
  let r = rooms.get(id);
  if (!r) {
    r = {
      roomId: id,
      users: new Map(),
      videoState: { url: "", playing: false, currentTime: 0 },
      messages: [],
      hostId: "",
      roomMode: "theater",
      maxUsers: 8,
    };
    rooms.set(id, r);
  }
  return r;
}

function genId(len = 12): string {
  return Array.from({ length: len }, () =>
    "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(Math.random() * 36)],
  ).join("");
}

const io = new Server(createServer(), { cors: { origin: "*" } });

io.on("connection", (socket) => {
  let currentRoom: string | null = null;

  socket.on("room:join", ({ roomId, nickname, roomMode, maxUsers }) => {
    const room = getRoom(roomId);
    if (!room.hostId) {
      room.hostId = socket.id;
      room.roomMode = roomMode === "couple" ? "couple" : "theater";
      room.maxUsers =
        room.roomMode === "couple" ? 2 : Math.min(50, Math.max(2, Math.floor(Number(maxUsers) || 8)));
    }
    if (!room.users.has(socket.id) && room.users.size >= room.maxUsers) {
      socket.emit("room:full", { maxUsers: room.maxUsers });
      return;
    }
    const user: OnlineUser = { socketId: socket.id, nickname: nickname || `匿名用户-${genId(4)}` };
    room.users.set(socket.id, user);
    currentRoom = roomId;
    socket.join(roomId);

    socket.emit("room:joined", {
      socketId: socket.id,
      roomId,
      users: Array.from(room.users.values()),
      videoState: { ...room.videoState },
      messages: room.messages.slice(-MAX_MESSAGES),
      isHost: room.hostId === socket.id,
      hostId: room.hostId,
      roomMode: room.roomMode,
      maxUsers: room.maxUsers,
    });

    socket.to(roomId).emit("user:joined", {
      user,
      users: Array.from(room.users.values()),
      hostId: room.hostId,
    });
  });

  socket.on("chat:send", ({ content }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    const me = room?.users.get(socket.id);
    if (!room || !me) return;
    const message: ChatMessage = {
      id: genId(),
      sender: me.nickname,
      content,
      timestamp: Date.now(),
    };
    room.messages.push(message);
    if (room.messages.length > MAX_MESSAGES) {
      room.messages.splice(0, room.messages.length - MAX_MESSAGES);
    }
    io.to(currentRoom).emit("chat:message", { message });
  });

  socket.on("video:state", ({ videoState }: { videoState: VideoState }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    if (room.roomMode === "theater" && socket.id !== room.hostId) return;
    room.videoState = { ...videoState };
    if (room.roomMode === "couple") {
      socket.to(currentRoom).emit("video:sync-state", { videoState });
    }
  });

  socket.on("video:seek", ({ currentTime, playing }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    if (room.roomMode === "theater" && socket.id !== room.hostId) return;
    room.videoState.currentTime = currentTime;
    room.videoState.playing = playing;
    if (room.roomMode === "couple") {
      socket.to(currentRoom).emit("video:sync-state", { videoState: { ...room.videoState } });
    }
  });

  socket.on("video:load", ({ videoState }: { videoState: VideoState }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    if (room.roomMode === "theater" && socket.id !== room.hostId) return;
    room.videoState = { ...videoState };
    if (room.roomMode === "couple") {
      socket.to(currentRoom).emit("video:sync-state", { videoState });
    } else {
      socket.to(currentRoom).emit("video:change-proposal", {
        videoState,
        proposerId: socket.id,
        proposerNickname: room.users.get(socket.id)?.nickname ?? "",
      });
    }
  });

  socket.on("video:resync", () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    socket.emit("video:sync-state", { videoState: { ...room.videoState } });
  });

  socket.on("disconnect", () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.users.delete(socket.id);
    if (room.hostId === socket.id && room.users.size > 0) {
      room.hostId = Array.from(room.users.keys())[0];
    }
    socket.to(currentRoom).emit("user:left", {
      socketId: socket.id,
      users: Array.from(room.users.values()),
      hostId: room.hostId,
    });
    if (room.users.size === 0) rooms.delete(currentRoom);
  });
});

const PORT = Number(process.env.PORT) || 3001;
io.listen(PORT);
console.log(`Socket.IO server listening on :${PORT}`);
