import { NextResponse } from "next/server";
import { generateQrCode } from "@/lib/bilibili";

/** GET /api/bilibili/qrcode — Generate a Bilibili QR code for login. Stateless. */
export async function GET() {
  try {
    const { qrUrl, qrcodeKey } = await generateQrCode();
    return NextResponse.json({ qrUrl, qrcodeKey });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "QR code generation failed" },
      { status: 502 },
    );
  }
}
