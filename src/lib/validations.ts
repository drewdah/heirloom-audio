// src/lib/validations.ts
/**
 * Shared validation helpers for HeirloomAudio.
 */

/** Cover image requirements (satisfies Audible, Apple Music, Spotify) */
export const COVER_IMAGE = {
  minWidth:    3000,
  minHeight:   3000,
  maxBytes:    5 * 1024 * 1024, // 5MB
  acceptedTypes: ["image/jpeg", "image/png"],
} as const;

/** Audio file upload limits */
export const AUDIO_UPLOAD = {
  maxBytes:      500 * 1024 * 1024, // 500 MB
  acceptedTypes: ["audio/wav", "audio/mpeg", "audio/mp3", "audio/x-wav", "audio/wave"],
} as const;

/** AAC / M4B export settings */
export const AUDIO_EXPORT = {
  bitrate:     "128k",
  sampleRate:  44100,
  channels:    1,
  lufs:        -18,
  truePeak:    -3,
} as const;
