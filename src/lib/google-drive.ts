import { google } from "googleapis";
import { Readable } from "stream";
import { prisma } from "./prisma";

/** Get an authenticated Drive client, proactively refreshing the token if needed */
export async function getDriveClient(userId: string) {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });

  if (!account) throw new Error("No Google account linked. Please sign out and sign in again.");
  if (!account.refresh_token) throw new Error("No refresh token stored. Please sign out, then sign in again to re-grant Drive access.");

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!
  );

  oauth2.setCredentials({
    access_token:  account.access_token ?? undefined,
    refresh_token: account.refresh_token,
    expiry_date:   account.expires_at ? account.expires_at * 1000 : undefined,
  });

  // Proactively refresh if token is expired or expiring within 60 seconds
  const expiresAt = account.expires_at ? account.expires_at * 1000 : 0;
  const isExpired = expiresAt < Date.now() + 60_000;

  if (isExpired) {
    try {
      const { credentials } = await oauth2.refreshAccessToken();
      oauth2.setCredentials(credentials);
      // Persist the new token
      await prisma.account.update({
        where: { id: account.id },
        data: {
          access_token: credentials.access_token ?? account.access_token,
          expires_at:   credentials.expiry_date
            ? Math.floor(credentials.expiry_date / 1000)
            : account.expires_at,
        },
      });
    } catch (err) {
      throw new Error("Google Drive token expired and could not be refreshed. Please sign out and sign in again.");
    }
  }

  // Also persist any future token refreshes that happen during API calls
  oauth2.on("tokens", async (tokens) => {
    await prisma.account.update({
      where: { id: account.id },
      data: {
        access_token: tokens.access_token ?? account.access_token,
        expires_at:   tokens.expiry_date
          ? Math.floor(tokens.expiry_date / 1000)
          : account.expires_at,
      },
    }).catch(() => {});
  });

  return google.drive({ version: "v3", auth: oauth2 });
}

/** Ensure HeirloomAudio root folder exists in the user's Drive, return its ID */
export async function ensureRootFolder(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.driveRootFolderId) return user.driveRootFolderId;

  const drive = await getDriveClient(userId);

  // Check if folder already exists (handles re-installs)
  const existing = await drive.files.list({
    q: `name='HeirloomAudio' and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents`,
    fields: "files(id)",
  });
  if (existing.data.files?.length) {
    const folderId = existing.data.files[0].id!;
    await prisma.user.update({ where: { id: userId }, data: { driveRootFolderId: folderId } });
    return folderId;
  }

  const res = await drive.files.create({
    requestBody: { name: "HeirloomAudio", mimeType: "application/vnd.google-apps.folder" },
    fields: "id",
  });
  const folderId = res.data.id!;
  await prisma.user.update({ where: { id: userId }, data: { driveRootFolderId: folderId } });
  return folderId;
}

/** Ensure a book folder exists inside the root folder, return its ID */
export async function ensureBookFolder(userId: string, bookId: string): Promise<string> {
  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) throw new Error("Book not found");
  if (book.driveFolderId) return book.driveFolderId;

  const rootFolderId = await ensureRootFolder(userId);
  const drive = await getDriveClient(userId);

  const res = await drive.files.create({
    requestBody: {
      name: book.title,
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootFolderId],
    },
    fields: "id",
  });
  const folderId = res.data.id!;
  await prisma.book.update({ where: { id: bookId }, data: { driveFolderId: folderId } });
  return folderId;
}

/** Ensure chapters subfolder exists inside a book folder, return its ID */
export async function ensureChaptersFolder(userId: string, bookId: string): Promise<string> {
  const bookFolderId = await ensureBookFolder(userId, bookId);
  const drive = await getDriveClient(userId);

  const existing = await drive.files.list({
    q: `'${bookFolderId}' in parents and name='chapters' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id)",
  });
  if (existing.data.files?.length) return existing.data.files[0].id!;

  const res = await drive.files.create({
    requestBody: {
      name: "chapters",
      mimeType: "application/vnd.google-apps.folder",
      parents: [bookFolderId],
    },
    fields: "id",
  });
  return res.data.id!;
}

/** Upload audio buffer to Drive, return { fileId, webViewLink } */
export async function uploadAudioToDrive(
  userId: string,
  bookId: string,
  fileName: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ fileId: string; webViewLink: string }> {
  const chaptersFolderId = await ensureChaptersFolder(userId, bookId);
  const drive = await getDriveClient(userId);

  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [chaptersFolderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id,webViewLink",
  });

  await drive.permissions.create({
    fileId: res.data.id!,
    requestBody: { role: "reader", type: "anyone" },
  });

  return {
    fileId: res.data.id!,
    webViewLink: res.data.webViewLink ?? "",
  };
}

/** Upload cover image to Drive book folder */
export async function uploadCoverToDrive(
  userId: string,
  bookId: string,
  buffer: Buffer,
  mimeType: string
): Promise<{ fileId: string; webContentLink: string }> {
  const bookFolderId = await ensureBookFolder(userId, bookId);
  const drive = await getDriveClient(userId);

  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (book?.coverDriveId) {
    await drive.files.delete({ fileId: book.coverDriveId }).catch(() => {});
  }

  const res = await drive.files.create({
    requestBody: { name: "cover.jpg", parents: [bookFolderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id,webContentLink",
  });

  await drive.permissions.create({
    fileId: res.data.id!,
    requestBody: { role: "reader", type: "anyone" },
  });

  const directUrl = `https://drive.google.com/uc?id=${res.data.id}&export=view`;
  return { fileId: res.data.id!, webContentLink: directUrl };
}

/** Delete a file from Drive (silently ignores errors) */
export async function deleteDriveFile(userId: string, fileId: string): Promise<void> {
  const drive = await getDriveClient(userId).catch(() => null);
  if (drive) await drive.files.delete({ fileId }).catch(() => {});
}

/** Direct download URL for an audio file */
export function getAudioStreamUrl(fileId: string): string {
  return `https://drive.google.com/uc?id=${fileId}&export=download`;
}
