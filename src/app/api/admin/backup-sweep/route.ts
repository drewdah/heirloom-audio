import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { backupTake } from "@/lib/take-backup";
import { isDriveEnabled } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

// Cap work per sweep so a large backlog (or a Drive hiccup) can't hammer Drive
// in one run — the next cron tick picks up where this left off.
const MAX_PER_SWEEP = 25;

/**
 * POST /api/admin/backup-sweep — retry originals stuck un-backed-up.
 *
 * Meant to be hit by cron (the droplet already runs cron). Finds takes left in
 * pending/failed (e.g. Drive outage during recording, or a restart mid-upload)
 * and re-runs backupTake() on them so originals converge to backed_up without a
 * user clicking retry. backupTake is idempotent, so overlapping runs are safe.
 *
 * Auth: Bearer <SWEEP_SECRET>. If SWEEP_SECRET is unset the endpoint is disabled
 * (401), so it can't be triggered by accident.
 *
 * Example cron (every 10 min):
 *   *\/10 * * * * curl -fsS -X POST http://localhost:3000/api/admin/backup-sweep \
 *     -H "Authorization: Bearer $SWEEP_SECRET" >/dev/null 2>&1
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SWEEP_SECRET;
  if (!secret) return NextResponse.json({ error: "Sweep disabled (no SWEEP_SECRET)" }, { status: 401 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isDriveEnabled())
    return NextResponse.json({ skipped: "drive_disabled", swept: 0, backedUp: 0, failed: 0 });

  // Only takes that still have a local original and no Drive copy yet.
  const stuck = await prisma.take.findMany({
    where: {
      backupStatus: { in: ["pending", "failed"] },
      audioFileUrl: { not: null },
      audioDriveId: null,
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: MAX_PER_SWEEP,
  });

  let backedUp = 0;
  let failed = 0;
  for (const t of stuck) {
    await backupTake(t.id); // idempotent; records status/error on the take itself
    const after = await prisma.take.findUnique({
      where: { id: t.id },
      select: { backupStatus: true },
    });
    if (after?.backupStatus === "backed_up") backedUp++;
    else failed++;
  }

  return NextResponse.json({ swept: stuck.length, backedUp, failed });
}
