import { NextRequest, NextResponse } from "next/server";
import { pollQrLogin } from "@/lib/bilibili";

/**
 * GET /api/bilibili/poll?qrcodeKey=xxx — Poll Bilibili QR login status.
 *
 * On success, returns SESSDATA/bili_jct/dedeUserId to the client.
 * The server does NOT store these — they are saved client-side (lib/biliAuth.ts).
 */
export async function GET(req: NextRequest) {
  const qrcodeKey = req.nextUrl.searchParams.get("qrcodeKey");
  if (!qrcodeKey) {
    return NextResponse.json({ error: "Missing qrcodeKey" }, { status: 400 });
  }

  try {
    const result = await pollQrLogin(qrcodeKey);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Poll failed" },
      { status: 502 },
    );
  }
}
