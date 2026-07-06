"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { PlayCircle, ArrowRight, Sparkle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { generateRoomId } from "@/lib/mockSocket";
import type { RoomMode } from "@/types";

export default function HomePage() {
  const router = useRouter();
  const toast = useToast();
  const [joinId, setJoinId] = useState("");
  const [roomMode, setRoomMode] = useState<RoomMode>("couple");
  const [maxUsers, setMaxUsers] = useState(8);

  const handleCreate = () => {
    const id = generateRoomId();
    const max = roomMode === "couple" ? 2 : Math.min(50, Math.max(2, Math.floor(maxUsers || 8)));
    router.push(`/room/${id}?mode=${roomMode}&max=${max}`);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const id = joinId.trim().toUpperCase();
    if (!id) {
      toast("请输入房间号");
      return;
    }
    if (!/^[A-Z0-9]{6}$/.test(id)) {
      toast("房间号为 6 位字母或数字");
      return;
    }
    router.push(`/room/${id}`);
  };

  return (
    <main className="min-h-[100dvh] flex flex-col">
      {/* Nav */}
      <nav className="h-16 px-6 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2 text-white font-semibold tracking-tight">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <PlayCircle size={20} weight="fill" />
          </span>
          SyncTube
        </div>
        <a
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          className="text-sm text-zinc-400 hover:text-white transition-colors"
        >
          关于
        </a>
      </nav>

      {/* Hero / actions */}
      <section className="flex-1 flex items-center justify-center px-6 pb-24">
        <div className="w-full max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-10"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-accent border border-accent/25 bg-accent/10 mb-6">
              <Sparkle size={13} weight="fill" />
              关键事件同步 · 多人聊天
            </span>
            <h1 className="text-4xl md:text-6xl font-semibold tracking-tight leading-[1.05] text-white">
              和远方的朋友，
              <br />
              看同一部视频
            </h1>
            <p className="mt-5 text-zinc-400 text-base md:text-lg max-w-[28rem] mx-auto leading-relaxed">
              创建情侣房间或放映厅，分享链接。关键操作同步，也可以按需一键对齐进度。
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
          >
            <Card className="p-8">
              <div className="flex flex-col gap-5">
                <div>
                  <p className="text-sm text-zinc-400 mb-3">新建房间</p>
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={roomMode === "couple" ? "primary" : "secondary"}
                      onClick={() => setRoomMode("couple")}
                    >
                      情侣房间
                    </Button>
                    <Button
                      type="button"
                      variant={roomMode === "theater" ? "primary" : "secondary"}
                      onClick={() => setRoomMode("theater")}
                    >
                      放映厅
                    </Button>
                  </div>
                  {roomMode === "theater" && (
                    <Input
                      type="number"
                      min={2}
                      max={50}
                      value={maxUsers}
                      onChange={(e) => setMaxUsers(Number(e.target.value))}
                      className="mb-3"
                      aria-label="放映厅最大人数"
                    />
                  )}
                  <Button
                    size="lg"
                    className="w-full"
                    onClick={handleCreate}
                  >
                    创建房间
                    <ArrowRight size={18} weight="bold" />
                  </Button>
                </div>

                <div className="flex items-center gap-3 text-xs text-zinc-500">
                  <div className="h-px flex-1 bg-border-subtle" />
                  或者
                  <div className="h-px flex-1 bg-border-subtle" />
                </div>

                <form onSubmit={handleJoin}>
                  <p className="text-sm text-zinc-400 mb-3">加入已有房间</p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Input
                      value={joinId}
                      onChange={(e) => setJoinId(e.target.value.toUpperCase())}
                      placeholder="输入 6 位房间号"
                      maxLength={6}
                      className="uppercase tracking-[0.2em] text-center sm:text-left"
                      aria-label="房间号"
                    />
                    <Button type="submit" size="lg" variant="secondary" className="shrink-0">
                      加入
                    </Button>
                  </div>
                </form>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
