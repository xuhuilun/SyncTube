"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { defaultNickname } from "@/lib/mockSocket";

interface NicknameGateProps {
  roomId: string;
  onJoin: (nickname: string) => void;
}

export function NicknameGate({ roomId, onJoin }: NicknameGateProps) {
  const [name, setName] = useState("");
  const [placeholder, setPlaceholder] = useState("匿名用户");

  useEffect(() => {
    setPlaceholder(defaultNickname());
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onJoin(name.trim() || defaultNickname());
  };

  return (
    <main className="min-h-[100dvh] flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md"
      >
        <Card className="p-8">
          <p className="text-sm text-accent mb-1">房间 {roomId}</p>
          <h1 className="text-2xl font-semibold text-white mb-1">输入昵称加入</h1>
          <p className="text-sm text-zinc-400 mb-6">
            这是其他人在房间里看到的名字，之后可以改。
          </p>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={placeholder}
              maxLength={16}
              autoFocus
              aria-label="昵称"
            />
            <Button type="submit" size="lg" className="w-full">
              进入房间
              <ArrowRight size={18} weight="bold" />
            </Button>
          </form>
        </Card>
      </motion.div>
    </main>
  );
}
