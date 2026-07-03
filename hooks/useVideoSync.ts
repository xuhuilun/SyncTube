"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoState } from "@/types";
import { getSocket } from "@/lib/mockSocket";

/**
 * Video sync hook.
 *
 * Core loop-avoidance rule: when a remote event arrives we apply it to the
 * player via an imperative ref and set a `applyingRemote` flag so our own
 * onPlay/onPause/onProgress handlers do NOT re-broadcast the change.
 */

interface UseVideoSyncArgs {
  roomId: string;
  initial?: VideoState | null;
  // Imperative control over the underlying player.
  playerRef: React.RefObject<{
    seekTo?: (seconds: number) => void;
  } | null>;
  isHost: boolean;
}

export function useVideoSync({ roomId, initial, playerRef, isHost }: UseVideoSyncArgs) {
  const [url, setUrl] = useState<string>(initial?.url ?? "");
  const [playing, setPlaying] = useState<boolean>(initial?.playing ?? false);
  // currentTime: ref for callback access, state for reactivity (time display / progress bar).
  const currentTimeRef = useRef<number>(initial?.currentTime ?? 0);
  const [currentTime, setCurrentTime] = useState<number>(initial?.currentTime ?? 0);
  const applyingRemote = useRef(false);
  const isHostRef = useRef(isHost);

  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  // Apply initial state once the room syncs.
  useEffect(() => {
    if (!initial) return;
    applyingRemote.current = true;
    setUrl(initial.url);
    setPlaying(initial.playing);
    currentTimeRef.current = initial.currentTime;
    setCurrentTime(initial.currentTime);
    // Seek after the player loads.
    const t = setTimeout(() => {
      playerRef.current?.seekTo?.(initial.currentTime);
      applyingRemote.current = false;
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const socket = getSocket();

  useEffect(() => {
    if (!roomId) return;

    const onState = (p: { videoState: VideoState }) => {
      applyingRemote.current = true;
      setUrl(p.videoState.url);
      setPlaying(p.videoState.playing);
      currentTimeRef.current = p.videoState.currentTime;
      setCurrentTime(p.videoState.currentTime);
      playerRef.current?.seekTo?.(p.videoState.currentTime);
      // Release the lock on the next tick.
      queueMicrotask(() => {
        applyingRemote.current = false;
      });
    };

    const onSeek = (p: { currentTime: number }) => {
      applyingRemote.current = true;
      currentTimeRef.current = p.currentTime;
      setCurrentTime(p.currentTime);
      playerRef.current?.seekTo?.(p.currentTime);
      queueMicrotask(() => {
        applyingRemote.current = false;
      });
    };

    socket.on("video:state", onState);
    socket.on("video:seek", onSeek);
    return () => {
      socket.off("video:state", onState);
      socket.off("video:seek", onSeek);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ---- Local user actions ----
  // Host: actions broadcast to all members via server.
  // Member: actions are local-only (no broadcast). Use resync() to re-sync.

  const loadUrl = useCallback(
    (newUrl: string) => {
      setUrl(newUrl);
      currentTimeRef.current = 0;
      setCurrentTime(0);
      const next: VideoState = {
        url: newUrl,
        playing: true,
        currentTime: 0,
      };
      setPlaying(true);
      if (isHostRef.current) {
        socket.emit("video:state", { videoState: next });
      }
    },
    [socket],
  );

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      const next = !p;
      if (isHostRef.current) {
        socket.emit("video:state", {
          videoState: {
            url,
            playing: next,
            currentTime: currentTimeRef.current,
          },
        });
      }
      return next;
    });
  }, [socket, url]);

  const seek = useCallback(
    (seconds: number) => {
      currentTimeRef.current = seconds;
      setCurrentTime(seconds);
      playerRef.current?.seekTo?.(seconds);
      if (isHostRef.current) {
        socket.emit("video:seek", { currentTime: seconds });
      }
    },
    [socket],
  );

  // Member requests current host state from server.
  const resync = useCallback(() => {
    socket.emit("video:resync");
  }, [socket]);

  // Called by the player on its natural time updates. Does NOT broadcast;
  // only keeps our local time ref fresh so a later toggle/seek is accurate.
  const onProgress = useCallback((seconds: number) => {
    if (applyingRemote.current) return;
    currentTimeRef.current = seconds;
    setCurrentTime(seconds);
  }, []);

  return {
    url,
    playing,
    currentTime,
    loadUrl,
    togglePlay,
    seek,
    onProgress,
    resync,
  };
}
