"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft } from "@phosphor-icons/react";
import { NicknameGate } from "@/components/room/NicknameGate";
import { VideoPlayer } from "@/components/room/VideoPlayer";
import { VideoControls } from "@/components/room/VideoControls";
import { ChatPanel } from "@/components/room/ChatPanel";
import { UserList } from "@/components/room/UserList";
import { InviteButton } from "@/components/room/InviteButton";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useRoom } from "@/hooks/useRoom";
import { useVideoSync } from "@/hooks/useVideoSync";
import { formatBiliQuality, isBilibili } from "@/lib/video";
import { loadBiliAuth, clearBiliAuth, getBiliSessdataHeader } from "@/lib/biliAuth";
import type { RoomMode } from "@/types";

interface BilibiliResolveResponse {
  streamUrl?: string;
  loggedIn?: boolean;
  quality?: number;
  acceptQualities?: number[];
  error?: string;
}

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const roomId = (params?.id ?? "").toUpperCase();
  const toast = useToast();

  const [nickname, setNickname] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  // Only join the room once the nickname is chosen, so we don't create a
  // ghost user with a default name that immediately leaves.
  const effectiveRoomId = nickname ? roomId : "";
  const requestedRoomMode: RoomMode = searchParams.get("mode") === "couple" ? "couple" : "theater";
  const requestedMaxUsers =
    requestedRoomMode === "couple" ? 2 : Number(searchParams.get("max") ?? 8);
  const room = useRoom(effectiveRoomId, nickname ?? "", {
    roomMode: requestedRoomMode,
    maxUsers: requestedMaxUsers,
  });

  const playerRef = useRef<{ seekTo?: (s: number) => void } | null>(null);
  const video = useVideoSync({
    roomId: effectiveRoomId,
    initial: room.videoState,
    playerRef,
    isHost: room.isHost,
    roomMode: room.roomMode,
  });

  // Bilibili 1080P: resolve video URL to a direct stream URL via server API.
  const [bilibiliStreamUrl, setBilibiliStreamUrl] = useState<string | null>(null);
  const [biliLoggedIn, setBiliLoggedIn] = useState(false);
  const [biliQuality, setBiliQuality] = useState<number | null>(null);
  const [biliQualities, setBiliQualities] = useState<number[]>([]);
  const [biliQualityLoading, setBiliQualityLoading] = useState(false);
  const pendingQualitySeekRef = useRef<number | null>(null);
  const biliResolveSeqRef = useRef(0);

  // Auto-login: check localStorage for saved Bilibili credentials on mount
  useEffect(() => {
    const auth = loadBiliAuth();
    if (auth) setBiliLoggedIn(true);
  }, []);

  const resolveBilibiliStream = useCallback(
    async (quality?: number, restoreTime?: number) => {
      const resolveId = ++biliResolveSeqRef.current;
      const query = new URLSearchParams({ url: video.url });
      if (quality) {
        query.set("quality", String(quality));
      }

      const headers = getBiliSessdataHeader();
      const res = await fetch(`/api/bilibili/resolve?${query.toString()}`, { headers });
      const data = (await res.json()) as BilibiliResolveResponse;
      if (!res.ok || data.error || !data.streamUrl) {
        throw new Error(data.error ?? "Resolve failed");
      }
      if (resolveId !== biliResolveSeqRef.current) {
        throw new Error("Stale resolve");
      }

      if (restoreTime != null) {
        pendingQualitySeekRef.current = restoreTime;
      }
      setBilibiliStreamUrl(data.streamUrl);
      setBiliLoggedIn(!!data.loggedIn);
      setBiliQuality(data.quality ?? null);
      setBiliQualities(data.acceptQualities ?? []);

      // If we had auth but the server says not logged in, SESSDATA is stale.
      if (!data.loggedIn && headers["x-bili-sessdata"]) {
        clearBiliAuth();
      }

      return data;
    },
    [video.url],
  );

  // Bilibili 1080P: resolve video URL to a direct stream URL via server API.
  // Passes SESSDATA from localStorage via header; clears stale auth if expired.
  useEffect(() => {
    if (!video.url || !isBilibili(video.url)) {
      biliResolveSeqRef.current += 1;
      setBilibiliStreamUrl(null);
      setBiliQuality(null);
      setBiliQualities([]);
      return;
    }
    let cancelled = false;
    setBilibiliStreamUrl(null);
    setBiliQualityLoading(true);

    resolveBilibiliStream()
      .catch(() => {
        if (!cancelled) {
          setBiliQuality(null);
          setBiliQualities([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBiliQualityLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [video.url, biliLoggedIn, resolveBilibiliStream]);

  const switchBiliQuality = async (quality: number) => {
    if (!video.url || quality === biliQuality) return;
    setBiliQualityLoading(true);
    try {
      const data = await resolveBilibiliStream(quality, video.currentTime);
      toast(`已切换到 ${formatBiliQuality(data.quality ?? quality)}`);
    } catch {
      toast("清晰度切换失败，请稍后重试");
    } finally {
      setBiliQualityLoading(false);
    }
  };

  const handlePlayerReady = () => {
    video.onReady();
    const pendingSeek = pendingQualitySeekRef.current;
    if (pendingSeek != null) {
      playerRef.current?.seekTo?.(pendingSeek);
      pendingQualitySeekRef.current = null;
    }
  };

  if (!nickname) {
    return <NicknameGate roomId={roomId} onJoin={setNickname} />;
  }

  if (room.full) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center px-6">
        <div className="glass rounded-2xl p-6 text-center">
          <p className="text-sm font-semibold text-white">房间已满</p>
          <p className="mt-2 text-xs text-zinc-500">该房间最多容纳 {room.maxUsers} 人。</p>
          <Button className="mt-4" variant="secondary" onClick={() => (window.location.href = "/")}>
            返回首页
          </Button>
        </div>
      </main>
    );
  }

  if (!room.joined) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center">
        <p className="text-sm text-zinc-500">正在连接房间…</p>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] flex flex-col">
      {/* Top bar */}
      <header className="h-16 px-4 sm:px-6 flex items-center justify-between border-b border-border-subtle">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => (window.location.href = "/")}
            aria-label="返回首页"
          >
            <ArrowLeft size={18} />
          </Button>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-white">房间 {roomId}</span>
            <span className="text-xs text-zinc-500">
              {room.roomMode === "couple" ? "情侣房间" : "放映厅"} · {room.users.length}/{room.maxUsers} 在线
              {room.isHost ? " · 房主" : ""}
            </span>
          </div>
        </div>
        <InviteButton roomId={roomId} />
      </header>

      {/* Body: video + chat. Chat goes right on desktop, below on mobile. */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
        {/* Video column */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-4 min-w-0"
        >
          <VideoPlayer
            url={video.url}
            streamUrl={bilibiliStreamUrl}
            playing={video.playing}
            onProgress={video.onProgress}
            onDuration={setDuration}
            onReady={handlePlayerReady}
            playerRef={playerRef}
          />
          <VideoControls
            url={video.url}
            playing={video.playing}
            currentTime={video.currentTime}
            duration={duration}
            biliLoggedIn={biliLoggedIn}
            biliQuality={biliQuality}
            biliQualities={biliQualities}
            biliQualityLoading={biliQualityLoading}
            isHost={room.isHost}
            roomMode={room.roomMode}
            canLoadVideo={room.roomMode === "couple" || room.isHost}
            onBiliLogin={() => setBiliLoggedIn(true)}
            onBiliQualityChange={switchBiliQuality}
            onUrlSubmit={video.loadUrl}
            onTogglePlay={video.togglePlay}
            onSeek={video.seek}
            onResync={video.resync}
          />
          {video.videoChangeProposal && (
            <div className="glass rounded-2xl border border-accent/20 p-4">
              <p className="text-sm font-semibold text-white">房主切换了视频</p>
              <p className="mt-1 text-xs text-zinc-500">
                你可以跟随跳转，也可以保留当前视频和进度继续观看。
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button variant="secondary" size="sm" onClick={video.acceptVideoChange}>
                  跟随跳转
                </Button>
                <Button variant="ghost" size="sm" onClick={video.rejectVideoChange}>
                  保留当前视频
                </Button>
              </div>
            </div>
          )}
          {/* Users */}
          <div className="glass rounded-2xl p-4">
            <p className="text-xs text-zinc-500 mb-3">在线用户</p>
            <UserList users={room.users} selfId={room.socketId} hostId={room.hostId} />
          </div>
          {duration > 0 && (
            <p className="text-xs text-zinc-600">
              {room.roomMode === "couple"
                ? "提示：情侣房间内任一方播放、暂停或拖动进度，都会同步给另一方。"
                : room.isHost
                  ? "提示：你的播放状态会作为放映厅官方参考状态，默认不打断成员观看。"
                  : "提示：你的操作仅本地生效，点击「同步到房主」可对齐进度。"}
            </p>
          )}
        </motion.section>

        {/* Chat column */}
        <motion.aside
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="glass rounded-2xl h-[60dvh] lg:h-auto lg:min-h-0 lg:sticky lg:top-6"
        >
          <ChatPanel
            roomId={roomId}
            initialMessages={room.messages}
            selfNickname={nickname}
          />
        </motion.aside>
      </div>
    </main>
  );
}
