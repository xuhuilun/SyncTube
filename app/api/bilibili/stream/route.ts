import { NextRequest } from "next/server";
import { proxyBilibiliStream, getSessionId } from "@/lib/bilibili";

/** GET /api/bilibili/stream?u=xxx — Proxy a Bilibili CDN video stream. */
export async function GET(req: NextRequest) {
  const cdnUrl = req.nextUrl.searchParams.get("u");
  if (!cdnUrl || !cdnUrl.startsWith("https://")) {
    return new Response("Missing or invalid stream URL", { status: 400 });
  }

  try {
    const sessionId = await getSessionId();
    const range = req.headers.get("range");
    return await proxyBilibiliStream(cdnUrl, sessionId, range);
  } catch (err) {
    return new Response(
      err instanceof Error ? err.message : "Stream proxy failed",
      { status: 502 },
    );
  }
}
