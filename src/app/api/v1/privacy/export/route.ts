import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { exportUserData } from "@/server/privacy";

export const runtime = "nodejs";
export const GET = route({ limit: [5, 600_000] }, async ({ user }) =>
  new NextResponse(JSON.stringify(exportUserData(user), null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="my-interview-data.json"', "Cache-Control": "no-store" } }));
