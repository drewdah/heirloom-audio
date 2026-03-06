# 🎙 HeirloomAudio

> *Record, produce, and share audiobooks with the people you love.*

HeirloomAudio is a self-hosted web app for recording professional-quality M4B audiobooks — designed to be given as a lasting gift to family members.

---

## ✨ Features

- 📚 **Skeuomorphic bookshelf** — beautiful dark library UI
- 🎙 **In-browser recording** — record chapter by chapter with your microphone
- ☁️ **Google Drive storage** — audio stored in your own Drive
- 📝 **Auto-transcription** — local Whisper AI, no API key needed
- 🎛 **Audio processing** — FFmpeg/SoX presets (EQ, de-esser, normalize)
- 📦 **M4B export** — professional audiobook with chapter markers
- 🔒 **Self-hosted** — your data, your server

---

## 🚀 Quick Start

### 1. Clone and configure

```bash
git clone https://github.com/yourname/heirloom-audio
cd heirloom-audio
cp .env.example .env
```

### 2. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (e.g. "HeirloomAudio")
3. Enable **Google Drive API**
4. Go to **APIs & Services → OAuth consent screen**
   - User type: External (or Internal if using Google Workspace)
   - Add scopes: `email`, `profile`, `https://www.googleapis.com/auth/drive.file`
5. Go to **Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Type: Web application
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
6. Copy the Client ID and Secret into your `.env`

### 3. Configure .env

```env
NEXTAUTH_SECRET=          # Run: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=         # From Google Cloud Console
GOOGLE_CLIENT_SECRET=     # From Google Cloud Console
ALLOWED_EMAILS=           # Comma-separated emails, or leave empty for all
```

### 4. Launch

```bash
docker-compose up -d
```

Open [http://localhost:3000](http://localhost:3000) 🎉

---

## 📁 Google Drive Structure

HeirloomAudio creates this folder structure in your Drive:

```
My Drive/
└── HeirloomAudio/
    └── {Book Title}/
        ├── cover.jpg
        ├── chapters/
        │   ├── 01-Chapter-Name.m4a
        │   └── ...
        └── exports/
            └── v1-2026-03-05.m4b
```

---

## 🎛 Audio Standards

All exports meet professional audiobook platform requirements:

| Spec | Value |
|------|-------|
| Format | M4B (AAC in MPEG-4) |
| Bitrate | 128 kbps |
| Sample Rate | 44,100 Hz |
| Channels | Mono |
| Peak Level | -3 dBFS |
| Loudness | -18 LUFS |
| Cover Art | 3000×3000px JPEG/PNG |

---

## 🏗 Development

```bash
npm install
cp .env.example .env.local
# Set DATABASE_URL=file:./dev.db in .env.local

npx prisma migrate dev
npm run dev
```

---

## 📄 License

MIT — made with ❤️ for families everywhere.
