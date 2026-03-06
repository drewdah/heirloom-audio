import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", service: "heirloom-audio" });
  } catch {
    return NextResponse.json({ status: "error", service: "heirloom-audio" }, { status: 503 });
  }
}
