import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDriveClient } from "@/lib/google-drive";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "google" },
    select: { access_token: true, refresh_token: true, expires_at: true, scope: true },
  });

  if (!account) return NextResponse.json({ error: "No Google account found" }, { status: 404 });

  const expiresAt = account.expires_at ? account.expires_at * 1000 : null;
  const tokenInfo = {
    has_access_token:  !!account.access_token,
    has_refresh_token: !!account.refresh_token,
    token_expired:     expiresAt ? expiresAt < Date.now() : null,
    expires_at:        expiresAt ? new Date(expiresAt).toISOString() : null,
    server_time_utc:   new Date().toISOString(),
    scope:             account.scope,
  };

  // Actually test a Drive API call
  let driveTest: { ok: boolean; error?: string; about?: unknown } = { ok: false };
  try {
    const drive = await getDriveClient(session.user.id);
    const res = await drive.about.get({ fields: "user,storageQuota" });
    driveTest = { ok: true, about: res.data.user };
  } catch (err) {
    driveTest = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  return NextResponse.json({ tokenInfo, driveTest });
}
