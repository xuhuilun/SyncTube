"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Spinner, Warning, SpinnerGap, QrCode, DeviceMobile } from "@phosphor-icons/react";
import { useToast } from "@/components/ui/Toast";
import { saveBiliAuth, saveBiliUser, fetchBiliUser, type BiliAuth, type BiliUser } from "@/lib/biliAuth";

type LoginStatus =
  | "idle"
  | "loading"
  | "waiting"
  | "scanned"
  | "logging_in"
  | "success"
  | "expired"
  | "error";

type LoginMode = "choice" | "qr";

interface BilibiliLoginProps {
  onLogin: () => void;
}

const POLL_INTERVAL = 1500; // 1.5s — faster feedback than the old 2s
const QR_TIMEOUT = 180_000; // 3 min auto-expire

export function BilibiliLogin({ onLogin }: BilibiliLoginProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<LoginMode>("qr");
  const [isMobile, setIsMobile] = useState(false);
  const [status, setStatus] = useState<LoginStatus>("idle");
  const [qrUrl, setQrUrl] = useState("");
  const [qrcodeKey, setQrcodeKey] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsMobile(
      /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ||
        window.matchMedia?.("(pointer: coarse)").matches ||
        false,
    );
  }, []);

  const startLogin = useCallback(async () => {
    setLoginMode("qr");
    setStatus("loading");
    setQrUrl("");
    setQrcodeKey("");
    try {
      const res = await fetch("/api/bilibili/qrcode");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQrUrl(data.qrUrl);
      setQrcodeKey(data.qrcodeKey);
      startTimeRef.current = Date.now();
      setStatus("waiting");
      return data as { qrUrl: string; qrcodeKey: string };
    } catch {
      setStatus("error");
      return null;
    }
  }, []);

  const saveQrImage = async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    const canvas = qrCanvasRef.current;
    if (!canvas) {
      throw new Error("QR canvas unavailable");
    }

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "bilibili-login-qr.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const openBilibiliAppLogin = async () => {
    const qr = qrUrl ? { qrUrl, qrcodeKey } : await startLogin();
    if (!qr?.qrUrl) return;

    try {
      await saveQrImage();
      toast("已尝试保存二维码，即将打开 B站扫一扫");
    } catch {
      toast("二维码保存失败，已继续尝试打开 B站扫一扫");
    }

    window.location.href = "bilibili://qrcode";
    window.setTimeout(() => {
      toast("如未打开 B站，请使用扫码登录或在系统浏览器中重试");
    }, 1200);
  };

  // Handle poll success: save credentials → fetch user → notify parent
  const handleSuccess = useCallback(
    async (auth: BiliAuth) => {
      setStatus("logging_in");
      try {
        // 1. Save credentials to localStorage + set stream cookie
        saveBiliAuth(auth);

        // 2. Fetch user info (uid, uname, face) via stateless proxy
        const user: BiliUser | null = await fetchBiliUser(auth.SESSDATA);
        if (user) {
          saveBiliUser(user);
        }

        // 3. Notify parent to re-resolve video with 1080P
        onLogin();

        // 4. Show success briefly before closing
        setStatus("success");
        setTimeout(() => {
          setOpen(false);
          setStatus("idle");
        }, 1200);
      } catch {
        setStatus("error");
      }
    },
    [onLogin],
  );

  // Poll login status
  useEffect(() => {
    if (status !== "waiting" && status !== "scanned") return;
    if (!qrcodeKey) return;

    const tick = async () => {
      // Auto-expire after timeout
      if (Date.now() - startTimeRef.current > QR_TIMEOUT) {
        setStatus("expired");
        return;
      }
      try {
        const res = await fetch(`/api/bilibili/poll?qrcodeKey=${encodeURIComponent(qrcodeKey)}`);
        const data = await res.json();
        if (data.status === "success" && data.sessdata) {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          await handleSuccess({
            SESSDATA: data.sessdata,
            biliJct: data.biliJct ?? "",
            dedeUserId: data.dedeUserId ?? "",
          });
        } else if (data.status === "scanned") {
          setStatus("scanned");
        } else if (data.status === "expired") {
          setStatus("expired");
        }
      } catch {
        // Keep polling on transient errors
      }
    };

    pollRef.current = setInterval(tick, POLL_INTERVAL);
    // Immediate first poll
    tick();

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [status, qrcodeKey, handleSuccess]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const closeModal = () => {
    setOpen(false);
    setLoginMode("qr");
    setStatus("idle");
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const openModal = () => {
    setOpen(true);
    if (isMobile) {
      setLoginMode("choice");
      setStatus("idle");
      setQrUrl("");
      setQrcodeKey("");
      return;
    }
    void startLogin();
  };

  return (
    <>
      <button
        onClick={openModal}
        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
      >
        B站扫码登录
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="glass rounded-2xl p-6 max-w-sm w-full mx-4 relative"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={closeModal}
                className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 transition-colors"
                aria-label="关闭"
              >
                <X size={18} />
              </button>

              <h3 className="text-sm font-semibold text-white mb-4 text-center">
                {isMobile && loginMode === "choice" ? "选择 B站登录方式" : "B站扫码登录"}
              </h3>

              <div className="flex flex-col items-center gap-4">
                {isMobile && loginMode === "choice" && (
                  <div className="grid w-full gap-3">
                    <button
                      type="button"
                      onClick={() => void startLogin()}
                      className="glass flex min-h-14 items-center gap-3 rounded-xl px-4 text-left transition-colors hover:bg-white/10"
                    >
                      <QrCode size={22} className="text-blue-400" weight="bold" />
                      <span>
                        <span className="block text-sm text-white">扫码登录</span>
                        <span className="block text-xs text-zinc-500">继续使用二维码完成登录</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void openBilibiliAppLogin()}
                      className="glass flex min-h-14 items-center gap-3 rounded-xl px-4 text-left transition-colors hover:bg-white/10"
                    >
                      <DeviceMobile size={22} className="text-blue-400" weight="bold" />
                      <span>
                        <span className="block text-sm text-white">打开 B站 APP</span>
                        <span className="block text-xs text-zinc-500">
                          保存二维码后打开扫一扫
                        </span>
                      </span>
                    </button>
                    <p className="text-center text-xs text-zinc-600">
                      微信等内置浏览器可能无法直接打开 APP，可改用扫码登录。
                    </p>
                  </div>
                )}

                {/* Loading: fetching QR */}
                {loginMode === "qr" && status === "loading" && (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <Spinner size={28} className="animate-spin text-blue-400" />
                    <p className="text-xs text-zinc-500">正在获取二维码...</p>
                  </div>
                )}

                {/* Waiting / Scanned: show QR */}
                {loginMode === "qr" && (status === "waiting" || status === "scanned") && qrUrl && (
                  <>
                    <div className="bg-white rounded-xl p-3">
                      <QRCodeSVG value={qrUrl} size={180} />
                      <QRCodeCanvas
                        ref={qrCanvasRef}
                        value={qrUrl}
                        size={360}
                        className="absolute -left-[9999px] -top-[9999px]"
                      />
                    </div>
                    {status === "waiting" && (
                      <p className="text-xs text-zinc-400 text-center">
                        请使用
                        <span className="text-blue-400"> B站 App </span>
                       扫描二维码登录
                      </p>
                    )}
                    {status === "scanned" && (
                      <div className="flex flex-col items-center gap-1">
                        <p className="text-xs text-blue-400 flex items-center gap-1">
                          <CheckCircle size={14} weight="fill" />
                          已扫描，请在手机上确认登录
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Logging in: saving credentials, fetching user */}
                {loginMode === "qr" && status === "logging_in" && (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <SpinnerGap size={32} className="animate-spin text-blue-400" />
                    <p className="text-sm text-white">请稍等，正在登录...</p>
                    <p className="text-xs text-zinc-500">正在获取用户信息并同步</p>
                  </div>
                )}

                {/* Success: done */}
                {loginMode === "qr" && status === "success" && (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <CheckCircle size={32} weight="fill" className="text-green-400" />
                    <p className="text-sm text-white">登录成功</p>
                  </div>
                )}

                {/* Expired */}
                {loginMode === "qr" && status === "expired" && (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <Warning size={28} weight="fill" className="text-amber-400" />
                    <p className="text-xs text-zinc-400">二维码已过期</p>
                    <button
                      onClick={startLogin}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      重新获取
                    </button>
                  </div>
                )}

                {/* Error */}
                {loginMode === "qr" && status === "error" && (
                  <div className="flex flex-col items-center gap-3 py-6">
                    <Warning size={28} weight="fill" className="text-red-400" />
                    <p className="text-xs text-zinc-400">获取二维码失败</p>
                    <button
                      onClick={startLogin}
                      className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      重试
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
