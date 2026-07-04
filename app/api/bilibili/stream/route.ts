import { NextRequest } from "next/server";
import { proxyBilibiliStream, getSessdataFromCookie } from "@/lib/bilibili";

/**
 * GET /api/bilibili/stream?u=xxx — Proxy a Bilibili CDN video stream.
 * Reads SESSDATA from the bili_sessdata cookie (set by client, since the
 * <video> element can't set custom headers). Stateless: no server-side session.
 */
export async function GET(req: NextRequest) {
  const cdnUrl = req.nextUrl.searchParams.get("u");
  if (!cdnUrl || !cdnUrl.startsWith("https://")) {
    return new Response("Missing or invalid stream URL", { status: 400 });
  }

  try {
    const sessdata = getSessdataFromCookie(req);
    const range = req.headers.get("range");
    return await proxyBilibiliStream(cdnUrl, sessdata, range);
  } catch (err) {
    return new Response(
      err instanceof Error ? err.message : "Stream proxy failed",
      { status: 502 },
    );
  }
}
