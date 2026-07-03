"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Crown, User } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { OnlineUser } from "@/types";

interface UserListProps {
  users: OnlineUser[];
  selfId: string | null;
  hostId: string | null;
}

export function UserList({ users, selfId, hostId }: UserListProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <AnimatePresence initial={false}>
        {users.map((u) => {
          const isSelf = u.socketId === selfId;
          const isHost = u.socketId === hostId;
          return (
            <motion.div
              key={u.socketId}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
            >
              <Badge
                className={cn(
                  "py-1.5",
                  isSelf && "border-accent/30 text-accent bg-accent/10",
                )}
              >
                {isHost ? (
                  <Crown size={13} weight="fill" className="text-amber-400" />
                ) : (
                  <User size={13} weight="fill" />
                )}
                {u.nickname}
                {isHost && (
                  <span className="text-[10px] text-amber-400/70 ml-0.5">房主</span>
                )}
                {isSelf && (
                  <span className="text-[10px] text-accent/70 ml-0.5">你</span>
                )}
              </Badge>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
