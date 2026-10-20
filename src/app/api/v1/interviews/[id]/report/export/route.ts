import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { exportReport } from "@/server/interview/report";

export const runtime = "nodejs";
export const GET = route<{ id: string }>({ roles: ["candidate"], limit: [20, 600_000] }, async ({ req, user, params }) => {
  const f = req.nextUrl.searchParams.get("format") === "json" ? "json" : "md";
  const out = exportReport(user, params.id, f);
  return new NextResponse(out.body, { headers: { "Content-Type": out.contentType, "Content-Disposition": `attachment; filename="${out.filename}"`, "Cache-Control": "no-store" } });
});
