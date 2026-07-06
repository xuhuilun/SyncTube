"use client";

import { useCallback, useEffect, useState } from "react";
import type { OnlineUser, VideoState, ChatMessage, RoomMode } from "@/types";
import { defaultNickname, getSocket } from "@/lib/mockSocket";

export interface RoomState {
  joined: boolean;
  socketId: string | null;
  users: OnlineUser[];
  videoState: VideoState | null;
  messages: ChatMessage[];
  isHost: boolean;
  hostId: string | null;
  roomMode: RoomMode;
  maxUsers: number;
  full: boolean;
}

interface UseRoomOptions {
  roomMode?: RoomMode;
  maxUsers?: number;
}

export function useRoom(roomId: string, nickname: string, options: UseRoomOptions = {}) {
  const [state, setState] = useState<RoomState>({
    joined: false,
    socketId: null,
    users: [],
    videoState: null,
    messages: [],
    isHost: false,
    hostId: null,
    roomMode: options.roomMode ?? "theater",
    maxUsers: options.maxUsers ?? 8,
    full: false,
  });

  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();
    socket.connect();

    const name = nickname?.trim() || defaultNickname();

    const onJoined = (ack: {
      socketId: string;
      users: OnlineUser[];
      videoState: VideoState;
      messages: ChatMessage[];
      isHost: boolean;
      hostId: string;
      roomMode: RoomMode;
      maxUsers: number;
    }) => {
      setState({
        joined: true,
        socketId: ack.socketId,
        users: ack.users,
        videoState: ack.videoState,
        messages: ack.messages,
        isHost: ack.isHost,
        hostId: ack.hostId,
        roomMode: ack.roomMode,
        maxUsers: ack.maxUsers,
        full: false,
      });
    };

    const onRoomFull = (p: { maxUsers: number }) => {
      setState((s) => ({ ...s, joined: false, full: true, maxUsers: p.maxUsers }));
    };

    const onUserJoined = (p: { user: OnlineUser; users: OnlineUser[]; hostId: string }) => {
      setState((s) => ({ ...s, users: p.users, hostId: p.hostId, isHost: p.hostId === s.socketId }));
    };

    const onUserLeft = (p: { socketId: string; users: OnlineUser[]; hostId: string }) => {
      setState((s) => ({ ...s, users: p.users, hostId: p.hostId, isHost: p.hostId === s.socketId }));
    };

    const onHostChanged = (p: { hostId: string; hostNickname: string }) => {
      setState((s) => ({ ...s, hostId: p.hostId, isHost: p.hostId === s.socketId }));
    };

    socket.on("room:joined", onJoined);
    socket.on("room:full", onRoomFull);
    socket.on("user:joined", onUserJoined);
    socket.on("user:left", onUserLeft);
    socket.on("host:changed", onHostChanged);

    // Slight delay so listeners are attached before the ack fires.
    queueMicrotask(() =>
      socket.emit("room:join", {
        roomId,
        nickname: name,
        roomMode: options.roomMode,
        maxUsers: options.maxUsers,
      }),
    );

    return () => {
      socket.off("room:joined", onJoined);
      socket.off("room:full", onRoomFull);
      socket.off("user:joined", onUserJoined);
      socket.off("user:left", onUserLeft);
      socket.off("host:changed", onHostChanged);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, nickname, options.roomMode, options.maxUsers]);

  const setUsers = useCallback((users: OnlineUser[]) => {
    setState((s) => ({ ...s, users }));
  }, []);

  return { ...state, setUsers };
}
