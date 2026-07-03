import { cookies } from "next/headers";
import { NextRequest } from "next/server";

/**
 * Bilibili API helpers.
 *
 * Handles QR code login, cookie storage (in-memory, per session), and
 * video stream resolution. Session ID is stored in an HTTP-only cookie;
 * Bilibili cookies are stored in a module-level Map keyed by session ID.
 */

// ---- Types ----

interface BilibiliCookies {
  SESSDATA: string;
  bili_jct: string;
  DedeUserID: string;
}

interface QrCodeResponse {
  code: number;
  data: {
    url: string;
    qrcode_key: string;
  };
}

interface PollResponse {
  code: number;
  message: string;
  data?: {
    url: string;
  };
}

interface VideoInfoResponse {
  code: number;
  data: {
    cid: number;
    title: string;
    pic: string;
    duration: number;
  };
}

interface PlayUrlResponse {
  code: number;
  data: {
    durl?: Array<{
      url: string;
      size: number;
      length: number;
    }>;
    accept_quality: number[];
  };
}

// ---- Session management ----

const SESSION_COOKIE = "synctube_session";
const cookieStore = new Map<string, BilibiliCookies>();

function genSessionId(): string {
  return crypto.randomUUID();
}

/** Returns the session ID from the cookie, or creates a new one. */
export async function getSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  if (existing) return existing;
  const id = genSessionId();
  store.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return id;
}

/** Returns the session ID from a NextRequest (for API routes that don't use cookies()). */
export function getSessionIdFromRequest(req: NextRequest): string {
  return req.cookies.get(SESSION_COOKIE)?.value ?? "";
}

// ---- Bilibili cookies ----

export function getBilibiliCookies(sessionId: string): BilibiliCookies | null {
  return cookieStore.get(sessionId) ?? null;
}

export function isLoggedIn(sessionId: string): boolean {
  return cookieStore.has(sessionId);
}

// ---- QR Login ----

const BILIBILI_PASSPORT = "https://passport.bilibili.com/x/passport-login/web/qrcode";

export async function generateQrCode(): Promise<{ qrUrl: string; qrcodeKey: string }> {
  const res = await fetch(`${BILIBILI_PASSPORT}/generate`);
  const json: QrCodeResponse = await res.json();
  if (json.code !== 0) {
    throw new Error(`Bilibili QR generate failed: ${json.code}`);
  }
  return {
    qrUrl: json.data.url,
    qrcodeKey: json.data.qrcode_key,
  };
}

export async function pollQrLogin(
  qrcodeKey: string,
  sessionId: string,
): Promise<{ status: "waiting" | "scanned" | "success" | "expired" }> {
  const res = await fetch(`${BILIBILI_PASSPORT}/poll?qrcode_key=${encodeURIComponent(qrcodeKey)}`, {
    redirect: "manual", // Don't follow redirects; cookies are in Set-Cookie headers
  });

  // Capture Set-Cookie headers (SESSDATA, bili_jct, DedeUserID)
  const setCookie = res.headers.get("set-cookie") ?? "";
  const json: PollResponse = await res.json();

  switch (json.code) {
    case 0: {
      // Success — parse cookies from Set-Cookie header
      const sessdata = extractCookie(setCookie, "SESSDATA");
      const biliJct = extractCookie(setCookie, "bili_jct");
      const dedeUserId = extractCookie(setCookie, "DedeUserID");
      if (sessdata && biliJct && dedeUserId) {
        cookieStore.set(sessionId, { SESSDATA: sessdata, bili_jct: biliJct, DedeUserID: dedeUserId });
      }
      return { status: "success" };
    }
    case 86090:
      return { status: "waiting" };
    case 86092:
      return { status: "scanned" };
    case 86093:
      return { status: "expired" };
    default:
      return { status: "waiting" };
  }
}

function extractCookie(setCookie: string, name: string): string | null {
  const regex = new RegExp(`${name}=([^;]+)`, "i");
  const match = setCookie.match(regex);
  return match ? match[1] : null;
}

// ---- Video resolution ----

const BILIBILI_API = "https://api.bilibili.com";

/** Extracts BV ID from a Bilibili URL. */
export function extractBvId(url: string): string | null {
  const match = url.match(/bilibili\.com\/video\/(BV\w+)/i);
  return match ? match[1] : null;
}

/** Fetches video info (cid, title, cover, duration) from Bilibili API. */
async function getVideoInfo(
  bvid: string,
  cookies: BilibiliCookies | null,
): Promise<{ cid: number; title: string; pic: string; duration: number }> {
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0",
    Referer: "https://www.bilibili.com",
  };
  if (cookies) {
    headers["Cookie"] = `SESSDATA=${cookies.SESSDATA}`;
  }

  const res = await fetch(`${BILIBILI_API}/x/web-interface/view?bvid=${bvid}`, { headers });
  const json: VideoInfoResponse = await res.json();
  if (json.code !== 0) {
    throw new Error(`Bilibili video info failed: ${json.code}`);
  }
  return {
    cid: json.data.cid,
    title: json.data.title,
    pic: json.data.pic,
    duration: json.data.duration,
  };
}

export interface ResolvedVideo {
  streamUrl: string;
  title: string;
  cover: string;
  duration: number;
  quality: number;
  loggedIn: boolean;
}

/**
 * Resolves a Bilibili video URL to a direct stream URL.
 * If the user is logged in, requests 1080P (qn=80); otherwise 480P (qn=32).
 * The returned streamUrl is a Bilibili CDN URL that requires a Referer header
 * to access — the client should use it via /api/bilibili/stream proxy.
 */
export async function resolveBilibiliVideo(
  bvid: string,
  sessionId: string,
): Promise<ResolvedVideo> {
  const cookies = getBilibiliCookies(sessionId);
  const info = await getVideoInfo(bvid, cookies);

  const qn = cookies ? 80 : 32; // 1080P if logged in, 480P otherwise
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0",
    Referer: "https://www.bilibili.com",
  };
  if (cookies) {
    headers["Cookie"] = `SESSDATA=${cookies.SESSDATA}`;
  }

  const res = await fetch(
    `${BILIBILI_API}/x/player/playurl?bvid=${bvid}&cid=${info.cid}&qn=${qn}&fnval=0`,
    { headers },
  );
  const json: PlayUrlResponse = await res.json();
  if (json.code !== 0 || !json.data.durl?.[0]) {
    throw new Error(`Bilibili playurl failed: ${json.code}`);
  }

  return {
    streamUrl: json.data.durl[0].url,
    title: info.title,
    cover: info.pic,
    duration: info.duration,
    quality: qn,
    loggedIn: !!cookies,
  };
}

// ---- Stream proxy ----

/**
 * Fetches a Bilibili CDN URL with proper headers, returning the upstream
 * Response for piping to the client. Supports Range requests for seeking.
 */
export async function proxyBilibiliStream(
  cdnUrl: string,
  sessionId: string,
  rangeHeader: string | null,
): Promise<Response> {
  const cookies = getBilibiliCookies(sessionId);
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0",
    Referer: "https://www.bilibili.com",
  };
  if (cookies) {
    headers["Cookie"] = `SESSDATA=${cookies.SESSDATA}`;
  }
  if (rangeHeader) {
    headers["Range"] = rangeHeader;
  }

  const res = await fetch(cdnUrl, { headers });

  // Return the response with relevant headers, streaming the body
  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "video/mp4",
      "Content-Length": res.headers.get("Content-Length") ?? "",
      "Content-Range": res.headers.get("Content-Range") ?? "",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
