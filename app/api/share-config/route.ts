import { NextResponse } from "next/server";

const DEFAULT_INVITE_INTRO = "快来加入我的房间一起玩吧！";

export async function GET() {
  return NextResponse.json({
    intro: process.env.INVITE_INTRO || DEFAULT_INVITE_INTRO,
  });
}
