"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, Spinner, Warning } from "@phosphor-icons/react";

type LoginStatus = "idle" | "loading" | "waiting" | "scanned" | "success" | "expired" | "error";

interface BilibiliLoginProps {
  onLogin: () => void;
}

export function BilibiliLogin({ onLogin }: BilibiliLoginProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<LoginStatus>("idle");
  const [qrUrl, setQrUrl] = useState("");
  const [qrcodeKey, setQrcodeKey] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startLogin = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await fetch("/api/bilibili/qrcode");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQrUrl(data.qrUrl);
      setQrcodeKey(data.qrcodeKey);
      setStatus("waiting");
    } catch {
      setStatus("error");
    }
  }, []);

  // Poll login status
  useEffect(() => {
    if (status !== "waiting" && status !== "scanned") return;
    if (!qrcodeKey) return;

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/bilibili/poll?qrcodeKey=${encodeURIComponent(qrcodeKey)}`);
        const data = await res.json();
        if (data.status === "success") {
          setStatus("success");
          setTimeout(() => {
            setOpen(false);
            onLogin();
          }, 1000);
        } else if (data.status === "scanned") {
          setStatus("scanned");
        } else if (data.status === "expired") {
          setStatus("expired");
        }
      } catch {
        // Keep polling on transient errors
      }
    }, 2000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, qrcodeKey, onLogin]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return (
    <>
      <button
        onClick={() => {
          setOpen(true);
          startLogin();
        }}
        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
      >
        B站登录看1080P
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
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
                onClick={() => setOpen(false)}
                className="absolute top-3 right-3 text-zinc-500 hover:text-zinc-300 transition-colors"
                aria-label="关闭"
              >
                <X size={18} />
              </button>

              <h3 className="text-sm font-semibold text-white mb-4 text-center">
                B站扫码登录
              </h3>

              <div className="flex flex-col items-center gap-4">
                {status === "loading" && (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <Spinner size={28} className="animate-spin text-blue-400" />
                    <p className="text-xs text-zinc-500">正在获取二维码...</p>
                  </div>
                )}

                {(status === "waiting" || status === "scanned") && qrUrl && (
                  <>
                    <div className="bg-white rounded-xl p-3">
                      <QRCodeSVG value={qrUrl} size={180} />
                    </div>
                    <p className="text-xs text-zinc-400 text-center">
                      使用 B站 APP 扫描二维码登录
                    </p>
                    {status === "scanned" && (
                      <p className="text-xs text-blue-400 flex items-center gap-1">
                        <CheckCircle size={14} weight="fill" />
                        已扫描，请在手机上确认登录
                      </p>
                    )}
                  </>
                )}

                {status === "success" && (
                  <div className="flex flex-col items-center gap-2 py-8">
                    <CheckCircle size={32} weight="fill" className="text-green-400" />
                    <p className="text-sm text-white">登录成功</p>
                  </div>
                )}

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
