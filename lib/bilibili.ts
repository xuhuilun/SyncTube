import { NextRequest } from "next/server";

/**
 * Bilibili API helpers — fully stateless.
 *
 * No server-side credential storage. SESSDATA is passed in as a parameter
 * from the client (via request headers or cookies). The server is a dumb
 * proxy: it receives SESSDATA transiently for API calls but never persists
 * it to disk, database, or memory.
 */

// ---- Types ----

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
    refresh_token: string;
    timestamp: number;
    code: number;
    message: string;
  };
}

interface NavResponse {
  code: number;
  data: {
    mid: number;
    uname: string;
    face: string;
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

export interface PollResult {
  status: "waiting" | "scanned" | "success" | "expired";
  sessdata?: string;
  biliJct?: string;
  dedeUserId?: string;
}

export interface ResolvedVideo {
  streamUrl: string;
  title: string;
  cover: string;
  duration: number;
  quality: number;
  loggedIn: boolean;
}

export interface BiliUserInfo {
  uid: number;
  uname: string;
  face: string;
}

// ---- Shared headers ----

const BILIBILI_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function buildBilibiliHeaders(sessdata?: string): Record<string, string> {
  const h: Record<string, string> = {
    "User-Agent": BILIBILI_UA,
    Referer: "https://www.bilibili.com",
  };
  if (sessdata) {
    h["Cookie"] = `SESSDATA=${sessdata}`;
  }
  return h;
}

// ---- QR Login (stateless: no session, no cookie store) ----

const BILIBILI_PASSPORT = "https://passport.bilibili.com/x/passport-login/web/qrcode";

export async function generateQrCode(): Promise<{ qrUrl: string; qrcodeKey: string }> {
  const res = await fetch(`${BILIBILI_PASSPORT}/generate`, {
    headers: buildBilibiliHeaders(),
  });
  const json: QrCodeResponse = await res.json();
  if (json.code !== 0) {
    throw new Error(`Bilibili QR generate failed: ${json.code}`);
  }
  return {
    qrUrl: json.data.url,
    qrcodeKey: json.data.qrcode_key,
  };
}

export async function pollQrLogin(qrcodeKey: string): Promise<PollResult> {
  const res = await fetch(
    `${BILIBILI_PASSPORT}/poll?qrcode_key=${encodeURIComponent(qrcodeKey)}`,
    { headers: buildBilibiliHeaders() },
  );

  const json: PollResponse = await res.json().catch(() => ({ code: -1, message: "" }));

  // The QR status may be in json.code (outer) or json.data.code (inner),
  // depending on the API version. Check both for robustness.
  const outerCode = json.code;
  const innerCode = json.data?.code ?? -1;

  // Success: outer code 0 with data.url, or inner code 860901000
  if ((outerCode === 0 && json.data?.url) || innerCode === 860901000) {
    const url = json.data?.url ?? "";
    const setCookie = res.headers.get("set-cookie") ?? "";
    const sessdata =
      extractQueryParam(url, "SESSDATA") ?? extractCookie(setCookie, "SESSDATA");
    const biliJct =
      extractQueryParam(url, "bili_jct") ?? extractCookie(setCookie, "bili_jct");
    const dedeUserId =
      extractQueryParam(url, "DedeUserID") ?? extractCookie(setCookie, "DedeUserID");
    return {
      status: "success",
      sessdata: sessdata ?? undefined,
      biliJct: biliJct ?? undefined,
      dedeUserId: dedeUserId ?? undefined,
    };
  }

  // Scanned: outer 86092 or inner 860901240
  if (outerCode === 86092 || innerCode === 860901240) {
    return { status: "scanned" };
  }

  // Expired: outer 86093 or inner 860901200
  if (outerCode === 86093 || innerCode === 860901200) {
    return { status: "expired" };
  }

  // Default: waiting (includes outer 86090, inner 861901240, or unknown codes)
  return { status: "waiting" };
}

function extractQueryParam(url: string, name: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get(name);
  } catch {
    return null;
  }
}

function extractCookie(setCookie: string, name: string): string | null {
  const regex = new RegExp(`${name}=([^;]+)`, "i");
  const match = setCookie.match(regex);
  return match ? match[1] : null;
}

// ---- User info (stateless: takes sessdata as param) ----

const BILIBILI_API = "https://api.bilibili.com";

export async function getBiliUser(sessdata: string): Promise<BiliUserInfo> {
  const res = await fetch(`${BILIBILI_API}/x/web-interface/nav`, {
    headers: buildBilibiliHeaders(sessdata),
  });
  const json: NavResponse = await res.json();
  if (json.code !== 0) {
    throw new Error(`Bilibili nav failed: ${json.code}`);
  }
  return {
    uid: json.data.mid,
    uname: json.data.uname,
    face: json.data.face,
  };
}

// ---- Video resolution (stateless: takes sessdata as param) ----

/** Extracts BV ID from a Bilibili URL. */
export function extractBvId(url: string): string | null {
  const match = url.match(/bilibili\.com\/video\/(BV\w+)/i);
  return match ? match[1] : null;
}

/** Fetches video info (cid, title, cover, duration) from Bilibili API. */
async function getVideoInfo(
  bvid: string,
  sessdata?: string,
): Promise<{ cid: number; title: string; pic: string; duration: number }> {
  const res = await fetch(`${BILIBILI_API}/x/web-interface/view?bvid=${bvid}`, {
    headers: buildBilibiliHeaders(sessdata),
  });
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

/**
 * Resolves a Bilibili video URL to a direct stream URL.
 * If sessdata is provided (logged in), requests 1080P (qn=80); otherwise 480P (qn=32).
 * The returned streamUrl is a Bilibili CDN URL that requires a Referer header
 * to access — the client should use it via /api/bilibili/stream proxy.
 */
export async function resolveBilibiliVideo(
  bvid: string,
  sessdata?: string,
): Promise<ResolvedVideo> {
  const info = await getVideoInfo(bvid, sessdata);
  const qn = sessdata ? 80 : 32; // 1080P if logged in, 480P otherwise

  const res = await fetch(
    `${BILIBILI_API}/x/player/playurl?bvid=${bvid}&cid=${info.cid}&qn=${qn}&fnval=0`,
    { headers: buildBilibiliHeaders(sessdata) },
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
    loggedIn: !!sessdata,
  };
}

// ---- Stream proxy (stateless: takes sessdata as param) ----

/**
 * Fetches a Bilibili CDN URL with proper headers, returning the upstream
 * Response for piping to the client. Supports Range requests for seeking.
 */
export async function proxyBilibiliStream(
  cdnUrl: string,
  sessdata: string | null,
  rangeHeader: string | null,
): Promise<Response> {
  const headers = buildBilibiliHeaders(sessdata ?? undefined);
  if (rangeHeader) {
    headers["Range"] = rangeHeader;
  }

  const res = await fetch(cdnUrl, { headers });

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

// ---- Request helpers (read sessdata from client request) ----

/** Reads SESSDATA from the x-bili-sessdata header (set by client fetch calls). */
export function getSessdataFromHeader(req: NextRequest): string | undefined {
  return req.headers.get("x-bili-sessdata") ?? undefined;
}

/** Reads SESSDATA from the bili_sessdata cookie (set by client for <video> element). */
export function getSessdataFromCookie(req: NextRequest): string | null {
  return req.cookies.get("bili_sessdata")?.value ?? null;
}
