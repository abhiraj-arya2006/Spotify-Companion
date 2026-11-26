# Spotify Companion AI

An advanced, personalized AI-powered music curator integrated with Spotify and Google Gemini.
Learns your authentic listening personality from library history, analyzes your multidimensional Music DNA, discovers hidden gems, and designs deliberate, expertly paced playlists exported directly to your Spotify account.

---

## Architecture & Features Overview

- **Spotify OAuth 2.0 Engine**: Confidential authorization code flow with automatic CSRF state validation, SQLite token encryption/storage, pre-expiration token refreshes, and graceful revocation.
- **Library Sync & Caching (Phase 4)**: Caches top tracks (150 across short, medium, and long term), top artists (143+), and saved tracks (200+) into SQLite with WAL mode.
- **Music DNA Engine (Phase 5)**: Computes taste archetypes (*The Melodic Enthusiast*), Mainstream vs Underground indices, and Artist Loyalty scores without relying on deprecated Spotify audio-features endpoints.
- **Conversational Curator (Phase 6)**: Autonomous Gemini function calling (`gemini-3.8-flash` with failover) connected directly to your library data and catalog search.
- **Responsive Dark-Mode Interface (Phase 7)**: Built with React, TypeScript, Vite, and Tailwind CSS.
- **1-Click Playlist Export (Phase 8)**: Playlist Architect blueprint generator that resolves tracks, creates real Spotify playlists, and adds songs in bulk.
- **PWA & Mobile Installability (Phase 9)**: Fully responsive with Web App Manifest, Service Worker, and mobile touch actions. Installable on iOS, Android, macOS, and Windows.
- **Adaptive Memory & Feedback Loop (Phase 10)**: Explicit Like/Dislike reaction controls that train Gemini's system prompt memory for future recommendations.

---

## Quickstart (Local Development)

### 1. Setup Environment
In `backend/.env`:
```ini
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/auth/spotify/callback
GEMINI_API_KEY=your_gemini_api_key
SESSION_SECRET=your_random_session_secret_32_bytes
PORT=3000
NODE_ENV=development
```

### 2. Install & Run
```bash
# Install all dependencies (backend + frontend)
npm run install:all

# Build both services
npm run build

# Start the full-stack server
npm start
```
Open **http://127.0.0.1:3000** in your browser.

---

## Progressive Web App (PWA) Installation

- **On Desktop (Chrome / Edge)**: Click the **Install** icon in the address bar (or Menu → *Install Spotify Companion AI*).
- **On iOS (Safari)**: Tap the Share button → **Add to Home Screen**.
- **On Android (Chrome)**: Tap the three dots → **Install App**.

---

## Production Cloud Deployment (Phase 9)

### Option A: Render.com / Railway
1. Push your repository to GitHub.
2. In Render, select **New Web Service** and link your repo (it will automatically detect `render.yaml`).
3. Set your environment variables in the Render Dashboard:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `SPOTIFY_REDIRECT_URI` (e.g. `https://your-app.onrender.com/auth/spotify/callback`)
   - `GEMINI_API_KEY`
   - `SESSION_SECRET`
4. Add your production redirect URI (`https://your-app.onrender.com/auth/spotify/callback`) to your **Spotify Developer Dashboard** under *Redirect URIs*.

### Option B: Docker
```bash
docker build -t spotify-companion .
docker run -p 3000:3000 --env-file backend/.env spotify-companion
```

---

## Development Milestones

- [x] **Phase 3**: Spotify OAuth 2.0 & Token Lifecycle
- [x] **Phase 4**: Library Data Sync & SQLite Cache
- [x] **Phase 5**: Multidimensional Music DNA Engine
- [x] **Phase 6**: Gemini AI Tool Calling & Conversational Intelligence
- [x] **Phase 7**: Responsive React + Tailwind Dashboard
- [x] **Phase 8**: Playlist Creation & Active Spotify Control
- [x] **Phase 9**: Desktop & Mobile Availability (PWA & Unified Deployment)
- [x] **Phase 10**: Recommendation Memory, Feedback Loops & Quality Hardening
