"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PaperPlaneTilt } from "@phosphor-icons/react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";
import { useChat } from "@/hooks/useChat";

interface ChatPanelProps {
  roomId: string;
  initialMessages: ChatMessage[];
  selfNickname: string;
}

export function ChatPanel({ roomId, initialMessages, selfNickname }: ChatPanelProps) {
  const { messages, send } = useChat(roomId, initialMessages);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    send(draft);
    setDraft("");
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-3 border-b border-border-subtle">
        <h2 className="text-sm font-semibold text-white">聊天</h2>
      </div>
      <ScrollArea
        ref={scrollRef}
        className="flex-1 min-h-0 px-4 py-3 space-y-3"
      >
        {messages.length === 0 ? (
          <p className="text-xs text-zinc-600 text-center mt-8">
            还没有消息，发一条打个招呼吧
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m) => {
              const isSelf = m.sender === selfNickname;
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  className={cn("flex flex-col", isSelf ? "items-end" : "items-start")}
                >
                  <div className="flex items-baseline gap-2 mb-1">
                    <span
                      className={cn(
                        "text-xs font-medium",
                        isSelf ? "text-accent" : "text-zinc-400",
                      )}
                    >
                      {m.sender}
                    </span>
                    <span className="text-[10px] text-zinc-600">
                      {new Date(m.timestamp).toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "max-w-[85%] rounded-xl px-3 py-2 text-sm break-words",
                      isSelf
                        ? "bg-accent/15 text-zinc-100 border border-accent/20"
                        : "bg-white/5 text-zinc-200 border border-border-subtle",
                    )}
                  >
                    {m.content}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </ScrollArea>
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-border-subtle flex gap-2"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="发条消息…"
          aria-label="消息内容"
        />
        <Button type="submit" size="icon" className="shrink-0" aria-label="发送">
          <PaperPlaneTilt size={18} weight="fill" />
        </Button>
      </form>
    </div>
  );
}
