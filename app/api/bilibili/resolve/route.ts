import { NextRequest, NextResponse } from "next/server";
import { resolveBilibiliVideo, extractBvId, getSessdataFromHeader } from "@/lib/bilibili";

/**
 * GET /api/bilibili/resolve?url=xxx — Resolve a Bilibili URL to stream info.
 * Reads SESSDATA from the x-bili-sessdata header (set by client from localStorage).
 * Stateless: no server-side session lookup.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  const qualityParam = req.nextUrl.searchParams.get("quality");
  let quality: number | undefined;
  if (qualityParam) {
    const parsedQuality = Number(qualityParam);
    if (!Number.isInteger(parsedQuality) || parsedQuality <= 0) {
      return NextResponse.json({ error: "Invalid quality" }, { status: 400 });
    }
    quality = parsedQuality;
  }

  const bvid = extractBvId(url);
  if (!bvid) {
    return NextResponse.json({ error: "Not a valid Bilibili video URL" }, { status: 400 });
  }

  try {
    const sessdata = getSessdataFromHeader(req);
    const resolved = await resolveBilibiliVideo(bvid, sessdata, quality);
    const proxyUrl = `/api/bilibili/stream?u=${encodeURIComponent(resolved.streamUrl)}`;
    return NextResponse.json({
      streamUrl: proxyUrl,
      title: resolved.title,
      cover: resolved.cover,
      duration: resolved.duration,
      quality: resolved.quality,
      acceptQualities: resolved.acceptQualities,
      acceptDescriptions: resolved.acceptDescriptions,
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
