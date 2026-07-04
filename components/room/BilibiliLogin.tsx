"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Spinner, Warning, SpinnerGap } from "@phosphor-icons/react";
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

interface BilibiliLoginProps {
  onLogin: () => void;
}

const POLL_INTERVAL = 1500; // 1.5s — faster feedback than the old 2s
const QR_TIMEOUT = 180_000; // 3 min auto-expire

export function BilibiliLogin({ onLogin }: BilibiliLoginProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<LoginStatus>("idle");
  const [qrUrl, setQrUrl] = useState("");
  const [qrcodeKey, setQrcodeKey] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  const startLogin = useCallback(async () => {
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
    } catch {
      setStatus("error");
    }
  }, []);

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
    setStatus("idle");
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          startLogin();
        }}
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
                B站扫码登录
              </h3>

              <div className="flex flex-col items-center gap-4">
                {/* Loading: fetching QR */}
                {status === "loading" && (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <Spinner size={28} className="animate-spin text-blue-400" />
                    <p className="text-xs text-zinc-500">正在获取二维码...</p>
                  </div>
                )}

                {/* Waiting / Scanned: show QR */}
                {(status === "waiting" || status === "scanned") && qrUrl && (
                  <>
                    <div className="bg-white rounded-xl p-3">
                      <QRCodeSVG value={qrUrl} size={180} />
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
                {status === "logging_in" && (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <SpinnerGap size={32} className="animate-spin text-blue-400" />
                    <p className="text-sm text-white">请稍等，正在登录...</p>
                    <p className="text-xs text-zinc-500">正在获取用户信息并同步</p>
                  </div>
                )}

                {/* Success: done */}
                {status === "success" && (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <CheckCircle size={32} weight="fill" className="text-green-400" />
                    <p className="text-sm text-white">登录成功</p>
                  </div>
                )}

                {/* Expired */}
                {status === "expired" && (
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
                {status === "error" && (
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
