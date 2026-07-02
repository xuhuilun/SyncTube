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
  playerRef: React.MutableRefObject<{
    seekTo?: (seconds: number) => void;
  } | null>;
}

export function useVideoSync({ roomId, initial, playerRef }: UseVideoSyncArgs) {
  const [url, setUrl] = useState<string>(initial?.url ?? "");
  const [playing, setPlaying] = useState<boolean>(initial?.playing ?? false);
  // currentTime is local player time; we do NOT re-render on every tick.
  const currentTimeRef = useRef<number>(initial?.currentTime ?? 0);
  const applyingRemote = useRef(false);

  // Apply initial state once the room syncs.
  useEffect(() => {
    if (!initial) return;
    applyingRemote.current = true;
    setUrl(initial.url);
    setPlaying(initial.playing);
    currentTimeRef.current = initial.currentTime;
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
      playerRef.current?.seekTo?.(p.videoState.currentTime);
      // Release the lock on the next tick.
      queueMicrotask(() => {
        applyingRemote.current = false;
      });
    };

    const onSeek = (p: { currentTime: number }) => {
      applyingRemote.current = true;
      currentTimeRef.current = p.currentTime;
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

  // ---- Local user actions (broadcast to others) ----

  const loadUrl = useCallback(
    (newUrl: string) => {
      setUrl(newUrl);
      currentTimeRef.current = 0;
      const next: VideoState = {
        url: newUrl,
        playing: true,
        currentTime: 0,
      };
      setPlaying(true);
      socket.emit("video:state", next);
    },
    [socket],
  );

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      const next = !p;
      socket.emit("video:state", {
        url,
        playing: next,
        currentTime: currentTimeRef.current,
      });
      return next;
    });
  }, [socket, url]);

  const seek = useCallback(
    (seconds: number) => {
      currentTimeRef.current = seconds;
      playerRef.current?.seekTo?.(seconds);
      socket.emit("video:seek", { currentTime: seconds });
    },
    [socket],
  );

  // Called by the player on its natural time updates. Does NOT broadcast;
  // only keeps our local time ref fresh so a later toggle/seek is accurate.
  const onProgress = useCallback((seconds: number) => {
    if (applyingRemote.current) return;
    currentTimeRef.current = seconds;
  }, []);

  return {
    url,
    playing,
    currentTime: currentTimeRef.current,
    loadUrl,
    togglePlay,
    seek,
    onProgress,
  };
}
