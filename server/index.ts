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
}

const MAX_MESSAGES = 200;
const rooms = new Map<string, Room>();

function getRoom(id: string): Room {
  let r = rooms.get(id);
  if (!r) {
    r = { roomId: id, users: new Map(), videoState: { url: "", playing: false, currentTime: 0 }, messages: [] };
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

  socket.on("room:join", ({ roomId, nickname }) => {
    const room = getRoom(roomId);
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
    });

    socket.to(roomId).emit("user:joined", {
      user,
      users: Array.from(room.users.values()),
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

  socket.on("video:state", (state: VideoState) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.videoState = { ...state };
    socket.to(currentRoom).emit("video:state", { videoState: state });
  });

  socket.on("video:seek", ({ currentTime }) => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.videoState.currentTime = currentTime;
    socket.to(currentRoom).emit("video:seek", { currentTime });
  });

  socket.on("disconnect", () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;
    room.users.delete(socket.id);
    socket.to(currentRoom).emit("user:left", {
      socketId: socket.id,
      users: Array.from(room.users.values()),
    });
    if (room.users.size === 0) rooms.delete(currentRoom);
  });
});

const PORT = Number(process.env.PORT) || 3001;
io.listen(PORT);
console.log(`Socket.IO server listening on :${PORT}`);
