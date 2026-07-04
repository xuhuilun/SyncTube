import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  JoinAck,
  OnlineUser,
  Room,
  SeekPayload,
  ServerToClientEvents,
  VideoState,
  VideoStatePayload,
} from "@/types";

type SyncSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Mock socket layer.
 *
 * Mirrors the socket.io-client public surface we actually use:
 *   socket.on(event, cb), socket.off(event, cb), socket.emit(event, payload),
 *   socket.connect(), socket.disconnect(), socket.id.
 *
 * State lives in the browser: each tab keeps its own copy of the rooms map,
 * kept in sync across tabs via a BroadcastChannel. This lets you open two
 * tabs, join the same room from each, and watch play/pause/seek/chat sync
 * for real. Swap this file for `io()` from socket.io-client later and the
 * hooks below keep working unchanged.
 */

type AnyHandler = (...args: never[]) => void;

const CHANNEL = "synctube-mock-socket";
const MAX_MESSAGES = 200;

// Cross-tab message envelope. "origin" prevents echo loops.
interface Envelope {
  origin: string;
  room: string;
  event: string;
  payload: unknown;
}

const emptyVideoState: VideoState = { url: "", playing: false, currentTime: 0 };

function makeRoom(roomId: string): Room {
  return {
    roomId,
    users: new Map(),
    videoState: { ...emptyVideoState },
    messages: [],
  };
}

// Singleton-ish store per tab. We attach it to window so every socket instance
// in the same tab shares state without a module-level singleton causing HMR
// duplicates.
interface Store {
  rooms: Map<string, Room>;
  channel: BroadcastChannel | null;
  listeners: Map<string, Set<AnyHandler>>; // local-only event bus for this socket
}

declare global {
  // eslint-disable-next-line no-var
  var __SYNCTUBE_STORE__: Store | undefined;
}

function getStore(): Store {
  if (typeof window === "undefined") {
    // SSR fallback. Won't be used on the client.
    return {
      rooms: new Map(),
      channel: null,
      listeners: new Map(),
    };
  }
  if (!window.__SYNCTUBE_STORE__) {
    window.__SYNCTUBE_STORE__ = {
      rooms: new Map(),
      channel:
        typeof BroadcastChannel !== "undefined"
          ? new BroadcastChannel(CHANNEL)
          : null,
      listeners: new Map(),
    };
  }
  return window.__SYNCTUBE_STORE__;
}

function getRoom(roomId: string): Room {
  const store = getStore();
  let room = store.rooms.get(roomId);
  if (!room) {
    room = makeRoom(roomId);
    store.rooms.set(roomId, room);
  }
  return room;
}

function genId(len = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function generateRoomId(): string {
  return genId(6).toUpperCase();
}

export function generateSocketId(): string {
  return `mock-${genId(12)}`;
}

export function defaultNickname(): string {
  return `匿名用户-${genId(4)}`;
}

type EventMap = ServerToClientEvents & ClientToServerEvents;
type EventName = keyof EventMap;

export class MockSocket {
  id: string;
  connected = false;
  private localHandlers: Map<string, Set<AnyHandler>> = new Map();
  private currentRoom: string | null = null;

  constructor(id: string = generateSocketId()) {
    this.id = id;
  }

  connect(): this {
    this.connected = true;
    const store = getStore();
    store.channel?.addEventListener("message", this.onCrossTab);
    return this;
  }

  disconnect(): this {
    this.connected = false;
    const store = getStore();
    store.channel?.removeEventListener("message", this.onCrossTab);
    if (this.currentRoom) {
      this.leaveRoom(this.currentRoom);
    }
    return this;
  }

  on<E extends EventName>(event: E, handler: EventMap[E]): this {
    const set =
      this.localHandlers.get(event) ?? new Set<AnyHandler>();
    set.add(handler as AnyHandler);
    this.localHandlers.set(event, set);
    return this;
  }

  off<E extends EventName>(event: E, handler?: EventMap[E]): this {
    const set = this.localHandlers.get(event);
    if (!set) return this;
    if (handler) {
      set.delete(handler as AnyHandler);
    } else {
      set.clear();
    }
    return this;
  }

  private emitLocal(event: string, ...args: unknown[]): void {
    const set = this.localHandlers.get(event);
    if (!set) return;
    for (const h of set) {
      // Defer so emit/on ordering matches real socket.io (async).
      queueMicrotask(() => h(...(args as never[])));
    }
  }

  // Cross-tab broadcast: write to the shared store, then ping other tabs.
  private broadcast(roomId: string, event: string, payload: unknown): void {
    const store = getStore();
    const env: Envelope = {
      origin: this.id,
      room: roomId,
      event,
      payload,
    };
    store.channel?.postMessage(env);
  }

  private onCrossTab = (e: MessageEvent<Envelope>): void => {
    const env = e.data;
    if (!env || env.origin === this.id) return;
    // Only forward events for the room we are in.
    if (this.currentRoom !== env.room) return;
    this.emitLocal(env.event, env.payload);
  };

  // ---- Client -> server emulation ----

  emit<E extends EventName>(
    event: E,
    ...args: Parameters<EventMap[E]>
  ): this {
    if (!this.connected) return this;

    switch (event) {
      case "room:join": {
        const [payload] = args as unknown as [{ roomId: string; nickname: string }];
        this.joinRoom(payload.roomId, payload.nickname);
        break;
      }
      case "chat:send": {
        const [payload] = args as unknown as [{ content: string }];
        this.handleChatSend(payload.content);
        break;
      }
      case "video:state": {
        const [payload] = args as unknown as [VideoStatePayload];
        this.handleVideoState(payload.videoState);
        break;
      }
      case "video:seek": {
        const [payload] = args as unknown as [SeekPayload];
        this.handleVideoSeek(payload);
        break;
      }
      case "video:load": {
        const [payload] = args as unknown as [VideoStatePayload];
        this.handleVideoLoad(payload.videoState);
        break;
      }
      case "video:resync": {
        if (!this.currentRoom) break;
        const room = getRoom(this.currentRoom);
        this.emitLocal("video:state", { videoState: { ...room.videoState } });
        break;
      }
      case "video:resync-response": {
        // No-op in mock mode — real server handles the relay
        break;
      }
      default:
        break;
    }
    return this;
  }

  private joinRoom(roomId: string, nickname: string): void {
    const room = getRoom(roomId);
    const user: OnlineUser = { socketId: this.id, nickname };
    room.users.set(this.id, user);
    this.currentRoom = roomId;

    const ack: JoinAck = {
      socketId: this.id,
      roomId,
      users: Array.from(room.users.values()),
      videoState: { ...room.videoState },
      messages: room.messages.slice(-MAX_MESSAGES),
      isHost: true,
      hostId: this.id,
    };
    this.emitLocal("room:joined", ack);

    // Tell others in the room (other tabs) that a user joined.
    const joinedPayload = {
      user,
      users: Array.from(room.users.values()),
    };
    this.broadcast(roomId, "user:joined", joinedPayload);
  }

  private leaveRoom(roomId: string): void {
    const store = getStore();
    const room = store.rooms.get(roomId);
    if (!room) return;
    room.users.delete(this.id);
    const users = Array.from(room.users.values());
    this.broadcast(roomId, "user:left", { socketId: this.id, users });
    if (room.users.size === 0) {
      store.rooms.delete(roomId);
    }
  }

  private handleChatSend(content: string): void {
    if (!this.currentRoom) return;
    const room = getRoom(this.currentRoom);
    const me = room.users.get(this.id);
    if (!me) return;
    const message = {
      id: genId(12),
      sender: me.nickname,
      content,
      timestamp: Date.now(),
    };
    room.messages.push(message);
    if (room.messages.length > MAX_MESSAGES) {
      room.messages.splice(0, room.messages.length - MAX_MESSAGES);
    }
    // Echo to self immediately.
    this.emitLocal("chat:message", { message });
    // Broadcast to others.
    this.broadcast(this.currentRoom, "chat:message", { message });
  }

  private handleVideoState(state: VideoState): void {
    if (!this.currentRoom) return;
    const room = getRoom(this.currentRoom);
    room.videoState = { ...state };
    // Broadcast to other tabs; they receive "video:state" and apply it.
    this.broadcast(this.currentRoom, "video:state", { videoState: state });
  }

  private handleVideoSeek(payload: SeekPayload): void {
    if (!this.currentRoom) return;
    const room = getRoom(this.currentRoom);
    room.videoState.currentTime = payload.currentTime;
    room.videoState.playing = payload.playing;
    this.broadcast(this.currentRoom, "video:seek", payload);
  }

  private handleVideoLoad(state: VideoState): void {
    if (!this.currentRoom) return;
    const room = getRoom(this.currentRoom);
    room.videoState = { ...state };
    // Do NOT broadcast — members sync only on explicit resync or host pause/play/seek
  }
}

let singleton: SyncSocket | null = null;

export function getSocket(): SyncSocket {
  if (typeof window === "undefined") {
    // SSR fallback: never used for actual I/O, just needs to satisfy the type.
    return new MockSocket() as unknown as SyncSocket;
  }
  if (!singleton) {
    // Connect to the same origin — the custom server (server.mjs) serves
    // both Next.js and Socket.IO on the same port.
    singleton = io(window.location.origin, {
      autoConnect: false, // match mock: connect() must be called explicitly
      reconnection: true,
    });
  }
  return singleton;
}
