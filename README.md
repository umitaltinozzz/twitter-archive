# Twitter Archive Dashboard

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-6-2d3748?logo=prisma&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003b57?logo=sqlite&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green)

---

> *Built because "I'll check it later" is a promise that never gets kept.*

## The Problem

I had thousands of bookmarks and liked tweets. Things I genuinely wanted to come back to — articles, threads, project ideas, design references. Twitter offers no way to search them, filter them, or organize them into anything meaningful.

After months of saving content and never revisiting it, I decided to solve it properly: export everything, store it locally, and build a dashboard that actually lets you find what you saved.

---

## Overview

Twitter Archive Dashboard is a self-hosted pipeline and web interface for your Twitter (X) bookmarks and likes. It captures tweet data through a browser userscript, downloads all associated media locally, ingests everything into a SQLite database, and serves a searchable, filterable dashboard through Next.js.

The pipeline is entirely local: no third-party cloud storage, no API keys, no rate limits.

---

## Project Status

Personal local-first tool / portfolio project. The implementation is public, but personal archives, downloaded media, and private user data are intentionally not included.

## Features

- **Full export pipeline** — captures tweet data via a browser userscript and downloads all associated media (images, videos, GIFs) in bulk
- **Local media serving** — media files are served from disk through a Next.js API route; no CDN dependency after initial download
- **Incremental ingestion** — re-running the ingest script updates content and media without overwriting user-added tags, notes, or project labels
- **Search & filter** — full-text search across tweet content, author, and metadata
- **Tagging & notes** — annotate any tweet with custom tags, project names, and personal notes
- **Quote tweet support** — quoted tweets are resolved from the same export file and stored inline
- **Graceful error handling** — tombstoned, unavailable, or deleted tweets are skipped without interrupting the export or ingest process

---

## Tech Stack

| Layer          | Technology                                      |
| -------------- | ----------------------------------------------- |
| Frontend & API | Next.js 16 (App Router)                         |
| Database       | Prisma ORM + SQLite                             |
| Data capture   | Violentmonkey + Twitter Web Exporter userscript |
| Media download | aria2 (parallel, resumable)                     |
| Language       | TypeScript                                      |

---

## Prerequisites

- **Firefox** with the [Violentmonkey](https://addons.mozilla.org/en-US/firefox/addon/violentmonkey/) extension
- **Node.js** v18 or later
- **Windows** (for `INDIR.bat`; the ingest pipeline itself is cross-platform)

---

## Setup

### 1. Clone and install dependencies

```bash
git clone https://github.com/umitaltinozzz/twitter-archive.git
cd twitter-archive
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env.local` and set `MEDIA_ROOT` to the folder where your downloaded media files will live:

```env
# Windows
MEDIA_ROOT=C:\Users\YourName\Desktop\twittermedia

# Linux / macOS
MEDIA_ROOT=/home/yourname/twittermedia
```

### 3. Initialize the database

```bash
npx prisma db push
```

### 4. Start the application

```bash
npm run dev
```

| Service   | URL                                                                   |
| --------- | --------------------------------------------------------------------- |
| Dashboard | [http://localhost:3000](http://localhost:3000)                        |
| API       | [http://localhost:3000/api/tweets](http://localhost:3000/api/tweets) |

---

## Data Collection

### Step 1 — Install the userscript

1. Install the [Violentmonkey](https://addons.mozilla.org/en-US/firefox/addon/violentmonkey/) extension in Firefox.
2. Create a new script in Violentmonkey and paste the contents of `betik.js`.
   > `betik.js` is a patched version of [Twitter Web Exporter](https://github.com/prinsss/twitter-web-exporter) with additional null-safety fixes for deleted accounts, tombstoned tweets, and missing user data.

### Step 2 — Capture tweet data

1. Log in to Twitter and navigate to **Bookmarks** or **Likes**.
2. Scroll through the feed — the userscript intercepts API responses and captures tweet data in the background.
3. When done scrolling, open the exporter panel and click **Export Data → JSON** (enable "Include all metadata").
4. Click **Export Media → Copy URLs** and save the output:
   - `liste.txt` — media URLs for bookmarks
   - `liste2.txt` — media URLs for likes

### Step 3 — Download media

Drag `liste.txt` or `liste2.txt` onto `INDIR.bat`.

- `aria2c.exe` is downloaded automatically on first run if not present.
- Downloads run with 16 parallel connections and 4 segments per file.
- If interrupted, re-running the script resumes from where it left off — already downloaded files are skipped.

### Step 4 — Organize files

Place the downloaded media and JSON exports in the following structure:

```
twittermedia/
├── twitter-Bookmarks-XXXXXXXXX.json
├── twitter-Likes-XXXXXXXXX.json
├── bookmarks/          ← media from bookmarks
│   ├── user_tweetid_photo_1_20260101.jpg
│   └── ...
└── liked/              ← media from likes
    ├── user_tweetid_video_1_20260101.mp4
    └── ...
```

Subdirectory names are not significant — the ingest script walks the entire `MEDIA_ROOT` tree recursively and matches files to tweets by ID.

### Step 5 — Ingest data

```bash
# PowerShell — set MEDIA_ROOT for the current session
$env:MEDIA_ROOT = "C:\Users\YourName\Desktop\twittermedia"

# Ingest bookmarks
npx tsx scripts/ingest.ts "C:\...\twittermedia\twitter-Bookmarks-XXXXXXXXX.json" bookmark

# Ingest likes
npx tsx scripts/ingest.ts "C:\...\twittermedia\twitter-Likes-XXXXXXXXX.json" like
```

The script outputs a summary on completion:

```
Tip          : bookmark
İşlenen      : 3910
Medya eşleşti: 3398
Medya yok    : 8
Quote bulunan: 83
```

---

## Re-ingesting Data

The ingest script is safe to run multiple times. It uses **upsert** semantics:

- New tweets are inserted.
- Existing tweets have their content and media refreshed.
- User-added **tags, notes, and project labels are never overwritten**.

To fully reset the database:

```bash
npx prisma migrate reset --force
npx prisma db push
```

---

## Project Structure

```
twitter-archive/
├── betik.js                           # Patched Violentmonkey userscript
├── INDIR.bat                          # Bulk media downloader (Windows / aria2)
├── prisma/
│   └── schema.prisma                  # Database schema
├── scripts/
│   ├── ingest.ts                      # JSON → SQLite ingest pipeline
│   └── normalize-bookmarks-export.mjs # Export JSON sanitizer
├── src/
│   └── app/
│       ├── api/
│       │   ├── tweets/                # REST endpoints
│       │   └── media/                 # Local media serving
│       └── page.tsx                   # Dashboard UI
├── .env.example
└── .gitignore
```

---

## Troubleshooting

| Issue | Resolution |
| ----- | ---------- |
| Export freezes at a specific count | Deleted or restricted accounts cause parsing errors. The patched `betik.js` skips these and continues. Check the browser console for skipped row counts. |
| `MEDIA_ROOT env tanımlı değil` | Ensure `.env.local` exists and contains a valid `MEDIA_ROOT` path. The `tsx` runtime does not load `.env.local` automatically — set the variable in your shell before running ingest. |
| `The table main.Tweet does not exist` | Run `npx prisma db push` to apply the schema to a fresh database. |
| Media files not loading in the UI | Verify that `MEDIA_ROOT` points to the correct parent directory and that the ingest script completed without errors. |
| `@N/A` displayed for some authors | The account was deleted or suspended before export; no user data is available in the source JSON. |

---

## License

[MIT](./LICENSE)
