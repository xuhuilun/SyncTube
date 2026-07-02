"use client";

import { useCallback, useEffect, useState } from "react";
import type { OnlineUser, VideoState, ChatMessage } from "@/types";
import { defaultNickname, getSocket } from "@/lib/mockSocket";

export interface RoomState {
  joined: boolean;
  socketId: string | null;
  users: OnlineUser[];
  videoState: VideoState | null;
  messages: ChatMessage[];
}

export function useRoom(roomId: string, nickname: string) {
  const [state, setState] = useState<RoomState>({
    joined: false,
    socketId: null,
    users: [],
    videoState: null,
    messages: [],
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
    }) => {
      setState({
        joined: true,
        socketId: ack.socketId,
        users: ack.users,
        videoState: ack.videoState,
        messages: ack.messages,
      });
    };

    const onUserJoined = (p: { user: OnlineUser; users: OnlineUser[] }) => {
      setState((s) => ({ ...s, users: p.users }));
    };

    const onUserLeft = (p: { socketId: string; users: OnlineUser[] }) => {
      setState((s) => ({ ...s, users: p.users }));
    };

    socket.on("room:joined", onJoined);
    socket.on("user:joined", onUserJoined);
    socket.on("user:left", onUserLeft);

    // Slight delay so listeners are attached before the ack fires.
    queueMicrotask(() => socket.emit("room:join", { roomId, nickname: name }));

    return () => {
      socket.off("room:joined", onJoined);
      socket.off("user:joined", onUserJoined);
      socket.off("user:left", onUserLeft);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, nickname]);

  const setUsers = useCallback((users: OnlineUser[]) => {
    setState((s) => ({ ...s, users }));
  }, []);

  return { ...state, setUsers };
}
