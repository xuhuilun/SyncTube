import { NextRequest, NextResponse } from "next/server";
import { pollQrLogin, getSessionId } from "@/lib/bilibili";

/** GET /api/bilibili/poll?qrcodeKey=xxx — Poll Bilibili QR login status. */
export async function GET(req: NextRequest) {
  const qrcodeKey = req.nextUrl.searchParams.get("qrcodeKey");
  if (!qrcodeKey) {
    return NextResponse.json({ error: "Missing qrcodeKey" }, { status: 400 });
  }

  try {
    // Use the session from cookies(); if missing, fall back to query param
    const sessionId = await getSessionId();
    const result = await pollQrLogin(qrcodeKey, sessionId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Poll failed" },
      { status: 502 },
    );
  }
}
