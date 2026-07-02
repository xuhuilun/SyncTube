"use client";

import { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, ShareNetwork } from "@phosphor-icons/react";
import { NicknameGate } from "@/components/room/NicknameGate";
import { VideoPlayer } from "@/components/room/VideoPlayer";
import { VideoControls } from "@/components/room/VideoControls";
import { ChatPanel } from "@/components/room/ChatPanel";
import { UserList } from "@/components/room/UserList";
import { Button } from "@/components/ui/Button";
import { useRoom } from "@/hooks/useRoom";
import { useVideoSync } from "@/hooks/useVideoSync";
import { useToast } from "@/components/ui/Toast";

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = (params?.id ?? "").toUpperCase();
  const toast = useToast();

  const [nickname, setNickname] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);

  // Only join the room once the nickname is chosen, so we don't create a
  // ghost user with a default name that immediately leaves.
  const effectiveRoomId = nickname ? roomId : "";
  const room = useRoom(effectiveRoomId, nickname ?? "");

  const playerRef = useRef<{ seekTo?: (s: number) => void } | null>(null);
  const video = useVideoSync({
    roomId: effectiveRoomId,
    initial: room.videoState,
    playerRef,
  });

  if (!nickname) {
    return <NicknameGate roomId={roomId} onJoin={setNickname} />;
  }

  if (!room.joined) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center">
        <p className="text-sm text-zinc-500">正在连接房间…</p>
      </main>
    );
  }

  const shareLink = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: "SyncTube 房间", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast("房间链接已复制");
      }
    } catch {
      toast("分享失败，请手动复制链接");
    }
  };

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
            <span className="text-xs text-zinc-500">{room.users.length} 人在线</span>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={shareLink}>
          <ShareNetwork size={15} weight="bold" />
          邀请
        </Button>
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
            playing={video.playing}
            onProgress={video.onProgress}
            onDuration={setDuration}
            playerRef={playerRef}
          />
          <VideoControls
            url={video.url}
            playing={video.playing}
            currentTime={video.currentTime}
            onUrlSubmit={video.loadUrl}
            onTogglePlay={video.togglePlay}
            onSeek={video.seek}
          />
          {/* Users */}
          <div className="glass rounded-2xl p-4">
            <p className="text-xs text-zinc-500 mb-3">在线用户</p>
            <UserList users={room.users} selfId={room.socketId} />
          </div>
          {duration > 0 && (
            <p className="text-xs text-zinc-600">
              提示：拖动播放器进度条会同步到房间内所有人。
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
