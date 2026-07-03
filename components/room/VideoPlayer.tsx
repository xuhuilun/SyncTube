"use client";

import { useEffect, useRef } from "react";
import ReactPlayer from "react-player";
import { getBilibiliEmbed } from "@/lib/video";

interface VideoPlayerProps {
  url: string;
  streamUrl?: string | null;
  playing: boolean;
  onProgress?: (seconds: number) => void;
  onDuration?: (seconds: number) => void;
  playerRef: React.RefObject<{ seekTo?: (s: number) => void } | null>;
}

/**
 * Renders react-player for supported formats, and falls back to a Bilibili
 * iframe for B站 URLs. When streamUrl is provided (resolved via Bilibili API
 * with login), react-player is used instead of the iframe, enabling full
 * play/pause/seek sync for Bilibili videos.
 */
export function VideoPlayer({
  url,
  streamUrl,
  playing,
  onProgress,
  onDuration,
  playerRef,
}: VideoPlayerProps) {
  const internalRef = useRef<ReactPlayer | null>(null);

  useEffect(() => {
    if (internalRef.current) {
      playerRef.current = {
        seekTo: (s: number) => internalRef.current?.seekTo(s, "seconds"),
      };
    }
  }, [playerRef]);

  // If we have a resolved stream URL, use it directly (bypass iframe).
  const playUrl = streamUrl ?? url;
  const bilibiliEmbed = streamUrl ? null : getBilibiliEmbed(url);

  if (!playUrl) {
    return (
      <div className="aspect-video w-full rounded-2xl glass flex items-center justify-center text-zinc-500">
        <div className="text-center px-6">
          <p className="text-sm">还没有加载视频</p>
          <p className="text-xs mt-1 text-zinc-600">在上方输入一个视频链接开始观看</p>
        </div>
      </div>
    );
  }

  if (bilibiliEmbed) {
    return (
      <div className="aspect-video w-full rounded-2xl overflow-hidden glass">
        <iframe
          src={bilibiliEmbed}
          className="w-full h-full"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          scrolling="no"
          frameBorder={0}
          title="bilibili-player"
        />
      </div>
    );
  }

  return (
    <div className="aspect-video w-full rounded-2xl overflow-hidden glass">
      <ReactPlayer
        ref={(r) => {
          internalRef.current = r;
          if (r) {
            playerRef.current = {
              seekTo: (s: number) => r.seekTo(s, "seconds"),
            };
          }
        }}
        url={playUrl}
        playing={playing}
        controls
        width="100%"
        height="100%"
        onProgress={(state) => onProgress?.(state.playedSeconds)}
        onDuration={(d) => onDuration?.(d)}
        config={{
          file: {
            attributes: { controlsList: "nodownload" },
          },
        }}
      />
    </div>
  );
}
