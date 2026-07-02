// Core domain types per the project doc.

export interface OnlineUser {
  socketId: string;
  nickname: string;
}

export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
}

export interface VideoState {
  url: string;
  playing: boolean;
  currentTime: number;
}

export interface Room {
  roomId: string;
  users: Map<string, OnlineUser>; // key: socketId
  videoState: VideoState;
  messages: ChatMessage[];
}

// ---- Socket event payloads ----

export interface JoinPayload {
  roomId: string;
  nickname: string;
}

export interface JoinAck {
  socketId: string;
  roomId: string;
  users: OnlineUser[];
  videoState: VideoState;
  messages: ChatMessage[];
}

export interface UserJoinedPayload {
  user: OnlineUser;
  users: OnlineUser[];
}

export interface UserLeftPayload {
  socketId: string;
  users: OnlineUser[];
}

export interface ChatPayload {
  message: ChatMessage;
}

export interface VideoStatePayload {
  videoState: VideoState;
}

export interface SeekPayload {
  currentTime: number;
}

// Events exchanged between client and server. Keeping them in one union makes
// the mock layer and a future real socket.io-client drop-in share the same shape.
export type ServerToClientEvents = {
  "room:joined": (ack: JoinAck) => void;
  "room:full": () => void;
  "user:joined": (payload: UserJoinedPayload) => void;
  "user:left": (payload: UserLeftPayload) => void;
  "chat:message": (payload: ChatPayload) => void;
  "video:state": (payload: VideoStatePayload) => void;
  "video:seek": (payload: SeekPayload) => void;
};

export type ClientToServerEvents = {
  "room:join": (payload: JoinPayload) => void;
  "chat:send": (payload: { content: string }) => void;
  "video:state": (payload: VideoState) => void;
  "video:seek": (payload: { currentTime: number }) => void;
};
