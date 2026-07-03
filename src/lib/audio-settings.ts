import { prisma } from "@/lib/prisma";

export interface AudioProcessingSettings {
  compression: string; // gentle | recommended | strong
  denoise: boolean;
}

const COMPRESSION_VALUES = ["gentle", "recommended", "strong"];

export function normalizeAudioSettings(input: {
  audioCompression?: string | null;
  audioDenoise?: boolean | null;
}): AudioProcessingSettings {
  const compression = COMPRESSION_VALUES.includes(input.audioCompression ?? "")
    ? (input.audioCompression as string)
    : "recommended";
  return { compression, denoise: input.audioDenoise ?? true };
}

/** Load a user's audio processing preferences for inclusion in a worker job. */
export async function getUserAudioSettings(userId: string): Promise<AudioProcessingSettings> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { audioCompression: true, audioDenoise: true },
  });
  return normalizeAudioSettings(user ?? {});
}
