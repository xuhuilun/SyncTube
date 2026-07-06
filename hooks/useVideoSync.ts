"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomMode, VideoChangeProposalPayload, VideoState } from "@/types";
import { getSocket } from "@/lib/mockSocket";

interface UseVideoSyncArgs {
  roomId: string;
  initial?: VideoState | null;
  playerRef: React.RefObject<{
    seekTo?: (seconds: number) => void;
  } | null>;
  isHost: boolean;
  roomMode: RoomMode;
}

export function useVideoSync({
  roomId,
  initial,
  playerRef,
  isHost,
  roomMode,
}: UseVideoSyncArgs) {
  const [url, setUrl] = useState<string>(initial?.url ?? "");
  const [playing, setPlaying] = useState<boolean>(initial?.playing ?? false);
  const currentTimeRef = useRef<number>(initial?.currentTime ?? 0);
  const [currentTime, setCurrentTime] = useState<number>(initial?.currentTime ?? 0);
  const [videoChangeProposal, setVideoChangeProposal] =
    useState<VideoChangeProposalPayload | null>(null);
  const applyingRemote = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const isHostRef = useRef(isHost);
  const roomModeRef = useRef<RoomMode>(roomMode);
  const urlRef = useRef(url);
  const playingRef = useRef(playing);

  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  useEffect(() => {
    roomModeRef.current = roomMode;
  }, [roomMode]);

  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const shouldPublishControl = useCallback(() => {
    return roomModeRef.current === "couple" || isHostRef.current;
  }, []);

  const applyVideoState = useCallback(
    (next: VideoState) => {
      applyingRemote.current = true;
      setUrl(next.url);
      urlRef.current = next.url;
      setPlaying(next.playing);
      playingRef.current = next.playing;
      currentTimeRef.current = next.currentTime;
      setCurrentTime(next.currentTime);
      pendingSeekRef.current = next.currentTime;
      playerRef.current?.seekTo?.(next.currentTime);
      queueMicrotask(() => {
        applyingRemote.current = false;
      });
    },
    [playerRef],
  );

  // First room join applies the server state once. No listener is installed
  // that continuously corrects member progress.
  useEffect(() => {
    if (!initial) return;
    applyVideoState(initial);
  }, [initial, applyVideoState]);

  const socket = getSocket();

  useEffect(() => {
    if (!roomId) return;

    const onSyncState = (p: { videoState: VideoState }) => {
      applyVideoState(p.videoState);
    };

    const onChangeProposal = (p: VideoChangeProposalPayload) => {
      if (roomModeRef.current !== "theater") return;
      setVideoChangeProposal(p);
    };

    const onResyncRequest = (p: { memberId: string }) => {
      const canProvideState = roomModeRef.current === "couple" || isHostRef.current;
      if (!canProvideState) return;
      socket.emit("video:resync-response", {
        memberId: p.memberId,
        videoState: {
          url: urlRef.current,
          playing: playingRef.current,
          currentTime: currentTimeRef.current,
        },
      });
    };

    socket.on("video:sync-state", onSyncState);
    socket.on("video:change-proposal", onChangeProposal);
    socket.on("video:resync-request", onResyncRequest);
    return () => {
      socket.off("video:sync-state", onSyncState);
      socket.off("video:change-proposal", onChangeProposal);
      socket.off("video:resync-request", onResyncRequest);
    };
  }, [applyVideoState, roomId, socket]);

  const loadUrl = useCallback(
    (newUrl: string) => {
      const next: VideoState = {
        url: newUrl,
        playing: true,
        currentTime: 0,
      };
      setUrl(next.url);
      urlRef.current = next.url;
      setPlaying(next.playing);
      playingRef.current = next.playing;
      currentTimeRef.current = next.currentTime;
      setCurrentTime(next.currentTime);
      pendingSeekRef.current = null;
      if (shouldPublishControl()) {
        socket.emit("video:load", { videoState: next });
      }
    },
    [shouldPublishControl, socket],
  );

  const togglePlay = useCallback(() => {
    setPlaying((p) => {
      const next = !p;
      playingRef.current = next;
      if (shouldPublishControl()) {
        socket.emit("video:state", {
          videoState: {
            url: urlRef.current,
            playing: next,
            currentTime: currentTimeRef.current,
          },
        });
      }
      return next;
    });
  }, [shouldPublishControl, socket]);

  const seek = useCallback(
    (seconds: number) => {
      currentTimeRef.current = seconds;
      setCurrentTime(seconds);
      playerRef.current?.seekTo?.(seconds);
      if (shouldPublishControl()) {
        socket.emit("video:seek", { currentTime: seconds, playing: playingRef.current });
      }
    },
    [playerRef, shouldPublishControl, socket],
  );

  const resync = useCallback(() => {
    socket.emit("video:resync");
  }, [socket]);

  const acceptVideoChange = useCallback(() => {
    if (!videoChangeProposal) return;
    applyVideoState(videoChangeProposal.videoState);
    setVideoChangeProposal(null);
  }, [applyVideoState, videoChangeProposal]);

  const rejectVideoChange = useCallback(() => {
    setVideoChangeProposal(null);
  }, []);

  const onReady = useCallback(() => {
    if (pendingSeekRef.current !== null) {
      playerRef.current?.seekTo?.(pendingSeekRef.current);
      pendingSeekRef.current = null;
    }
  }, [playerRef]);

  const onProgress = useCallback((seconds: number) => {
    if (applyingRemote.current) return;
    currentTimeRef.current = seconds;
    setCurrentTime(seconds);
  }, []);

  return {
    url,
    playing,
    currentTime,
    videoChangeProposal,
    loadUrl,
    togglePlay,
    seek,
    onProgress,
    onReady,
    resync,
    acceptVideoChange,
    rejectVideoChange,
  };
}
