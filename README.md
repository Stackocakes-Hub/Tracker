# Tracker

Web app for reading and writing XML tickets in [Tracker-Vault](https://github.com/Stackocakes-Hub/Tracker-Vault).

This repository is **application source**. Logs are **not** here.

Live site: https://light-bamboo-earth-cloud.grok.me

## Local

```bash
git clone https://github.com/Stackocakes-Hub/Tracker.git
cd Tracker
npm install
mkdir -p data
# GitHub token that can read/write Tracker-Vault
echo "YOUR_GITHUB_TOKEN" > data/tracker-vault.token
# or: export GH_TOKEN=...
npm run dev
```

Open http://127.0.0.1:8080

Copy `.env.example` if you prefer env vars. Do not commit tokens.

```bash
npm run typecheck
npm run build
```

## Stack

TanStack Start, Vite, React. GitHub Contents API for XML. Website picture uploads go to Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set; otherwise `data/tracker-pictures/`. Adjacent Grok hosts pictures itself and uses `<image href="https://…"/>`.

## Related

| Repo | What |
|---|---|
| [Tracker-Vault](https://github.com/Stackocakes-Hub/Tracker-Vault) | XML logs, PROTOCOL.md |
| [Grok-Host](https://github.com/Stackocakes-Hub/Grok-Host) | Public https images for discussion hrefs |
