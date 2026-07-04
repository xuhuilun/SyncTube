import { NextRequest, NextResponse } from "next/server";
import { getBiliUser, getSessdataFromHeader } from "@/lib/bilibili";

/**
 * GET /api/bilibili/user — Fetch Bilibili user info (uid, uname, face).
 * Reads SESSDATA from the x-bili-sessdata header. Stateless.
 */
export async function GET(req: NextRequest) {
  const sessdata = getSessdataFromHeader(req);
  if (!sessdata) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  try {
    const user = await getBiliUser(sessdata);
    return NextResponse.json(user);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "User info fetch failed" },
      { status: 502 },
    );
  }
}
