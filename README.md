<div align="center">

# Twitter Archive Dashboard

**Self-hosted archive for Twitter bookmarks and likes**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-SQLite-2D3748?style=for-the-badge&logo=prisma)](https://www.prisma.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](./LICENSE)

</div>

---

## Overview

Twitter's native bookmarks and likes offer no search, no filtering, and no organization. This tool exports that data into a local SQLite database and serves it through a Next.js dashboard with full-text search, media preview, tagging, and note-taking.

The pipeline is entirely local — no third-party cloud, no API keys, no rate limits.

## Features

- Full export pipeline via a Violentmonkey userscript (patched Twitter Web Exporter)
- Local media serving — images, videos, and GIFs stored and served from disk
- Incremental ingestion — reruns update content without overwriting user tags/notes
- Full-text search across tweet content, author, and metadata
- Tagging, notes, and project labels per tweet
- Quote tweet support

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend & API | Next.js 16 (App Router) |
| Database | Prisma ORM + SQLite |
| Data capture | Violentmonkey + patched Twitter Web Exporter |
| Media download | aria2 (parallel, resumable) |
| Language | TypeScript |

## Getting Started

`ash
git clone https://github.com/umitaltinozzz/twitter-archive.git
cd twitter-archive
npm install
cp .env.example .env.local  # set MEDIA_ROOT path
npx prisma db push
npm run dev
`

Open [http://localhost:3000](http://localhost:3000).

See the full README for the data collection pipeline (userscript setup, media download, ingest).

## License

MIT
