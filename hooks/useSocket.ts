"use client";

import { useEffect, useRef, useState } from "react";
import { getSocket, MockSocket } from "@/lib/mockSocket";

/**
 * Returns a connected MockSocket singleton. On the server we return a
 * not-connected placeholder so SSR markup stays stable. The real socket
 * connects in a useEffect after mount.
 */
export function useSocket() {
  const socketRef = useRef<MockSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;
    socket.connect();
    setConnected(true);
    return () => {
      socket.disconnect();
      setConnected(false);
    };
  }, []);

  return { socket: socketRef.current, connected };
}
