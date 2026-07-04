"use client";

import { useState, useEffect } from "react";
import {
  ArrowsClockwise,
  CaretDown,
  CheckCircle,
  LinkSimple,
  Pause,
  Play,
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { BilibiliLogin } from "@/components/room/BilibiliLogin";
import { formatBiliQuality, formatTime, isBilibili } from "@/lib/video";
import { loadBiliUser } from "@/lib/biliAuth";

interface VideoControlsProps {
  url: string;
  playing: boolean;
  currentTime: number;
  duration?: number;
  biliLoggedIn?: boolean;
  biliQuality?: number | null;
  biliQualities?: number[];
  biliQualityLoading?: boolean;
  isHost: boolean;
  onBiliLogin?: () => void;
  onBiliQualityChange?: (quality: number) => void;
  onUrlSubmit: (url: string) => void;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onResync?: () => void;
}

export function VideoControls({
  url,
  playing,
  currentTime,
  duration = 0,
  biliLoggedIn = false,
  biliQuality = null,
  biliQualities = [],
  biliQualityLoading = false,
  isHost,
  onBiliLogin,
  onBiliQualityChange,
  onUrlSubmit,
  onTogglePlay,
  onSeek,
  onResync,
}: VideoControlsProps) {
  const [draft, setDraft] = useState("");
  const [biliUserName, setBiliUserName] = useState<string | null>(null);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);

  useEffect(() => {
    if (biliLoggedIn) {
      const user = loadBiliUser();
      setBiliUserName(user?.uname ?? null);
    } else {
      setBiliUserName(null);
    }
  }, [biliLoggedIn]);

  const submitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    onUrlSubmit(draft.trim());
    setDraft("");
  };

  const bilibili = isBilibili(url);
  const biliSynced = bilibili && biliLoggedIn;
  const canSwitchBiliQuality =
    bilibili && biliQualities.length > 1 && !!onBiliQualityChange && !biliQualityLoading;

  return (
    <div className="flex flex-col gap-3">
      {isHost && (
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
      )}

      {/* Bilibili login / status */}
      {bilibili && (
        <div className="flex flex-wrap items-center gap-3">
          {biliLoggedIn ? (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <CheckCircle size={14} weight="fill" />
              B站已登录 1080P{biliUserName ? ` · ${biliUserName}` : ""}
            </span>
          ) : (
            <>
              <BilibiliLogin onLogin={() => onBiliLogin?.()} />
              <span className="text-xs text-zinc-600">未登录仅 480P</span>
            </>
          )}

          <div className="relative">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-w-24"
              onClick={() => canSwitchBiliQuality && setQualityMenuOpen((open) => !open)}
              disabled={!canSwitchBiliQuality}
              title={
                biliQualities.length <= 1 ? "当前视频仅支持一种清晰度" : "切换清晰度"
              }
            >
              {biliQualityLoading ? (
                <SpinnerGap size={15} className="animate-spin" />
              ) : (
                formatBiliQuality(biliQuality)
              )}
              <CaretDown size={14} />
            </Button>

            {qualityMenuOpen && canSwitchBiliQuality && (
              <div className="absolute left-0 top-11 z-30 min-w-36 overflow-hidden rounded-xl border border-border-subtle bg-surface-800/95 shadow-glass">
                {biliQualities.map((quality) => (
                  <button
                    key={quality}
                    type="button"
                    onClick={() => {
                      setQualityMenuOpen(false);
                      onBiliQualityChange?.(quality);
                    }}
                    className="flex h-10 w-full items-center justify-between px-3 text-left text-sm text-zinc-100 transition-colors hover:bg-white/10 disabled:text-accent"
                    disabled={quality === biliQuality}
                  >
                    <span>{formatBiliQuality(quality)}</span>
                    {quality === biliQuality && <CheckCircle size={14} weight="fill" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Warning: only for iframe mode (not logged in or b23.tv) */}
      {bilibili && !biliSynced && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-200/80">
          <Warning size={15} weight="fill" className="mt-0.5 shrink-0" />
          <span>
            {/b23\.tv\//i.test(url)
              ? "b23.tv 短链接无法直接内嵌，请使用完整的 bilibili.com/video/ 链接。"
              : "未登录B站，使用内嵌方式播放，无法精确同步播放、暂停和进度。登录后可享受1080P并支持同步控制。"}
          </span>
        </div>
      )}

      {/* Member: resync to host */}
      {!isHost && url && (!bilibili || biliSynced) && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => onResync?.()}>
            <ArrowsClockwise size={15} weight="bold" />
            同步到房主
          </Button>
          <span className="text-xs text-zinc-600">你的操作仅本地生效</span>
        </div>
      )}

      {/* Play/pause + progress: show for non-Bilibili, or Bilibili when logged in (react-player with sync) */}
      {url && (!bilibili || biliSynced) && (
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
