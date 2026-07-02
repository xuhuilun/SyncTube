"use client";

import { AnimatePresence, motion } from "framer-motion";
import { User } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import type { OnlineUser } from "@/types";

interface UserListProps {
  users: OnlineUser[];
  selfId: string | null;
}

export function UserList({ users, selfId }: UserListProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <AnimatePresence initial={false}>
        {users.map((u) => {
          const isSelf = u.socketId === selfId;
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
                <User size={13} weight="fill" />
                {u.nickname}
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
