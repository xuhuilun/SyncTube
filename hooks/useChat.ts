"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/types";
import { getSocket } from "@/lib/mockSocket";

export function useChat(roomId: string, initial: ChatMessage[] = []) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const lastCountRef = useRef(0);

  useEffect(() => {
    // When the room hook delivers the recent message history, seed it.
    if (initial.length && initial.length !== lastCountRef.current) {
      setMessages(initial);
      lastCountRef.current = initial.length;
    }
  }, [initial]);

  useEffect(() => {
    if (!roomId) return;
    const socket = getSocket();
    const onMessage = (p: { message: ChatMessage }) => {
      setMessages((prev) => {
        const next = [...prev, p.message];
        if (next.length > 200) next.splice(0, next.length - 200);
        return next;
      });
    };
    socket.on("chat:message", onMessage);
    return () => {
      socket.off("chat:message", onMessage);
    };
  }, [roomId]);

  const send = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      getSocket().emit("chat:send", { content: trimmed });
    },
    [],
  );

  return { messages, send };
}
