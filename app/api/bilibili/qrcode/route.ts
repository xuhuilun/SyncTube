import { NextResponse } from "next/server";
import { generateQrCode, getSessionId } from "@/lib/bilibili";

/** GET /api/bilibili/qrcode — Generate a Bilibili QR code for login. */
export async function GET() {
  try {
    const sessionId = await getSessionId();
    const { qrUrl, qrcodeKey } = await generateQrCode();
    return NextResponse.json({ qrUrl, qrcodeKey, sessionId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "QR code generation failed" },
      { status: 502 },
    );
  }
}
