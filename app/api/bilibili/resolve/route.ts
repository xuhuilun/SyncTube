import { NextRequest, NextResponse } from "next/server";
import { resolveBilibiliVideo, extractBvId, getSessionId } from "@/lib/bilibili";

/** GET /api/bilibili/resolve?url=xxx — Resolve a Bilibili URL to stream info. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const bvid = extractBvId(url);
  if (!bvid) {
    return NextResponse.json({ error: "Not a valid Bilibili video URL" }, { status: 400 });
  }

  try {
    const sessionId = await getSessionId();
    const resolved = await resolveBilibiliVideo(bvid, sessionId);
    // Encode the CDN URL for the stream proxy
    const proxyUrl = `/api/bilibili/stream?u=${encodeURIComponent(resolved.streamUrl)}`;
    return NextResponse.json({
      streamUrl: proxyUrl,
      title: resolved.title,
      cover: resolved.cover,
      duration: resolved.duration,
      quality: resolved.quality,
      loggedIn: resolved.loggedIn,
      bvid,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Resolve failed" },
      { status: 502 },
    );
  }
}
