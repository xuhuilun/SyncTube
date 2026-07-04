"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChatCircleText, Copy, ShareNetwork, WechatLogo, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

const DEFAULT_INVITE_INTRO = "快来加入我的房间一起玩吧！";

interface InviteButtonProps {
  roomId: string;
}

interface ShareDetails {
  title: string;
  desc: string;
  link: string;
  text: string;
  imgUrl: string;
}

interface ShareCapabilities {
  isMobile: boolean;
  canShareToQQ: boolean;
  canShareToWechat: boolean;
}

declare global {
  interface Window {
    wx?: {
      updateAppMessageShareData?: (
        data: Pick<ShareDetails, "title" | "desc" | "link" | "imgUrl"> & {
          success?: () => void;
          fail?: () => void;
        },
      ) => void;
    };
    mqq?: {
      ui?: {
        shareMessage?: (data: {
          title: string;
          desc: string;
          share_url: string;
          image_url: string;
        }) => void;
      };
    };
  }
}

function getShareCapabilities(): ShareCapabilities {
  if (typeof window === "undefined") {
    return { isMobile: false, canShareToQQ: false, canShareToWechat: false };
  }

  const ua = window.navigator.userAgent;
  const isMobile =
    /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
    window.matchMedia?.("(pointer: coarse)").matches ||
    false;

  return {
    isMobile,
    canShareToQQ: /QQ\//i.test(ua) && typeof window.mqq?.ui?.shareMessage === "function",
    canShareToWechat:
      /MicroMessenger/i.test(ua) &&
      typeof window.wx?.updateAppMessageShareData === "function",
  };
}

function getEncodedCurrentUrl(roomId: string): string {
  const fallback = `${window.location.origin}/room/${encodeURIComponent(roomId)}`;

  try {
    return new URL(window.location.href || fallback).toString();
  } catch {
    return encodeURI(fallback);
  }
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("Clipboard copy failed");
  }
}

export function InviteButton({ roomId }: InviteButtonProps) {
  const toast = useToast();
  const [inviteIntro, setInviteIntro] = useState(DEFAULT_INVITE_INTRO);
  const [shareOpen, setShareOpen] = useState(false);
  const [manualCopyText, setManualCopyText] = useState("");
  const [shareCapabilities, setShareCapabilities] = useState<ShareCapabilities>({
    isMobile: false,
    canShareToQQ: false,
    canShareToWechat: false,
  });

  useEffect(() => {
    setShareCapabilities(getShareCapabilities());

    let cancelled = false;
    fetch("/api/share-config")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { intro?: string } | null) => {
        if (!cancelled && data?.intro) {
          setInviteIntro(data.intro);
        }
      })
      .catch(() => {
        // Keep the built-in default if the config endpoint is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const buildShareDetails = (): ShareDetails => {
    const link = getEncodedCurrentUrl(roomId);
    return {
      title: "SyncTube 房间邀请",
      desc: inviteIntro,
      link,
      text: `${inviteIntro}\n${link}`,
      imgUrl: `${window.location.origin}/favicon.ico`,
    };
  };

  const copyInviteText = async (details = buildShareDetails()) => {
    try {
      await copyText(details.text);
      setManualCopyText("");
      setShareOpen(false);
      toast("已复制，快去粘贴给好友吧");
    } catch {
      setManualCopyText(details.text);
      setShareOpen(true);
      toast("复制失败，请手动复制邀请文本");
    }
  };

  const openInviteShare = async () => {
    const details = buildShareDetails();
    const capabilities = getShareCapabilities();
    setShareCapabilities(capabilities);

    if (capabilities.isMobile) {
      setManualCopyText("");
      setShareOpen(true);
      return;
    }

    await copyInviteText(details);
  };

  const shareToQQ = () => {
    const details = buildShareDetails();
    try {
      const shareMessage = window.mqq?.ui?.shareMessage;
      if (typeof shareMessage !== "function") {
        throw new Error("QQ share is unavailable");
      }

      shareMessage({
        title: details.title,
        desc: details.desc,
        share_url: details.link,
        image_url: details.imgUrl,
      });
      toast("已打开 QQ 分享，请选择好友发送");
    } catch {
      toast("QQ 分享不可用，请使用复制链接");
    }
  };

  const shareToWechat = () => {
    const details = buildShareDetails();
    try {
      const updateShareData = window.wx?.updateAppMessageShareData;
      if (typeof updateShareData !== "function") {
        throw new Error("WeChat share is unavailable");
      }

      updateShareData({
        title: details.title,
        desc: details.desc,
        link: details.link,
        imgUrl: details.imgUrl,
        success: () => toast("已准备微信分享，请在微信菜单中发送给好友"),
        fail: () => toast("微信分享不可用，请使用复制链接"),
      });
    } catch {
      toast("微信分享不可用，请使用复制链接");
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={openInviteShare}>
        <ShareNetwork size={15} weight="bold" />
        邀请好友
      </Button>

      {shareOpen && (
        <div
          className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60 px-4 py-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="invite-share-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="glass w-full max-w-sm rounded-2xl p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="invite-share-title" className="text-base font-semibold text-white">
                  邀请好友
                </h2>
                <p className="mt-1 text-xs text-zinc-500">选择一种分享方式发送房间链接。</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 shrink-0"
                onClick={() => setShareOpen(false)}
                aria-label="关闭邀请面板"
              >
                <X size={18} />
              </Button>
            </div>

            <div className="mt-4 grid gap-3">
              <Button
                variant="secondary"
                size="lg"
                className="h-12 justify-start"
                onClick={() => copyInviteText()}
              >
                <Copy size={20} weight="bold" />
                复制链接
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="h-12 justify-start"
                onClick={shareToQQ}
                disabled={!shareCapabilities.canShareToQQ}
                title={shareCapabilities.canShareToQQ ? "分享到 QQ" : "当前环境不支持 QQ 分享"}
              >
                <ChatCircleText size={20} weight="bold" />
                QQ
                {!shareCapabilities.canShareToQQ && (
                  <span className="ml-auto text-xs text-zinc-500">不可用</span>
                )}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="h-12 justify-start"
                onClick={shareToWechat}
                disabled={!shareCapabilities.canShareToWechat}
                title={shareCapabilities.canShareToWechat ? "分享到微信" : "当前环境不支持微信分享"}
              >
                <WechatLogo size={20} weight="bold" />
                微信
                {!shareCapabilities.canShareToWechat && (
                  <span className="ml-auto text-xs text-zinc-500">不可用</span>
                )}
              </Button>
            </div>

            {manualCopyText && (
              <textarea
                className="mt-4 min-h-24 w-full resize-none rounded-xl border border-border-subtle bg-surface-800/80 p-3 text-sm text-zinc-100 outline-none focus:border-accent/60"
                readOnly
                value={manualCopyText}
                onFocus={(event) => event.currentTarget.select()}
                aria-label="手动复制邀请文本"
              />
            )}
          </motion.div>
        </div>
      )}
    </>
  );
}
