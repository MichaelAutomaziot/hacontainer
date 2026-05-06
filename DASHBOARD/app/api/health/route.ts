import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "hacontainer-dashboard",
      uptime: Math.round(process.uptime()),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
