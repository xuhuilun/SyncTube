"use client";

import { useState } from "react";
import { Pause, Play, LinkSimple, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatTime, isBilibili } from "@/lib/video";

interface VideoControlsProps {
  url: string;
  playing: boolean;
  currentTime: number;
  duration?: number;
  onUrlSubmit: (url: string) => void;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
}

export function VideoControls({
  url,
  playing,
  currentTime,
  duration = 0,
  onUrlSubmit,
  onTogglePlay,
  onSeek,
}: VideoControlsProps) {
  const [draft, setDraft] = useState("");

  const submitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onUrlSubmit(draft.trim());
    setDraft("");
  };

  const bilibili = isBilibili(url);

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submitUrl} className="flex flex-col sm:flex-row gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="粘贴视频链接（MP4 / HLS / YouTube / B站）"
          aria-label="视频链接"
        />
        <Button type="submit" variant="secondary" className="shrink-0">
          <LinkSimple size={16} weight="bold" />
          加载
        </Button>
      </form>

      {bilibili && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200/80">
          <Warning size={15} weight="fill" className="mt-0.5 shrink-0" />
          <span>
            {/b23\.tv\//i.test(url)
              ? "b23.tv 短链接无法直接内嵌，请使用完整的 bilibili.com/video/ 链接。"
              : "B站视频通过内嵌方式播放，受平台限制无法精确同步播放、暂停和进度。两端加载同一视频即可。"}
          </span>
        </div>
      )}

      {url && !bilibili && (
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="secondary"
            onClick={onTogglePlay}
            aria-label={playing ? "暂停" : "播放"}
          >
            {playing ? (
              <Pause size={18} weight="fill" />
            ) : (
              <Play size={18} weight="fill" />
            )}
          </Button>
          <span className="text-sm text-zinc-400 font-mono tabular-nums shrink-0">
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={Math.min(currentTime, duration || 0)}
            onChange={(e) => onSeek(Number(e.target.value))}
            className="flex-1 h-1 accent-blue-400 cursor-pointer"
            aria-label="进度条"
            disabled={!duration}
          />
          <span className="text-sm text-zinc-500 font-mono tabular-nums shrink-0">
            {formatTime(duration)}
          </span>
        </div>
      )}
    </div>
  );
}
