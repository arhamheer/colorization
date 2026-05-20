# Chromatic Archive Frontend

This is the Vite + React frontend for the colorization backend.

## Visual Direction

The UI is intentionally editorial and cinematic: archival noir, bronze highlights, paper-like texture, and a large compare slider as the memorable interaction.

## Local Setup

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Set `VITE_BACKEND_URL` in `.env` to your Hugging Face Space API base URL, for example:

```bash
VITE_BACKEND_URL=https://arhamheer-colorization10.hf.space
```

## Vercel Deployment

1. In Vercel, create a new project from this repository.
2. Set the root directory to `frontend`.
3. Add an environment variable:
   - `VITE_BACKEND_URL` = `https://arhamheer-colorization10.hf.space`
4. Build command: `npm run build`
5. Output directory: `dist`

## Backend Contract

- `GET /api/options` returns model and preset metadata.
- `POST /api/colorize` accepts multipart form data:
  - `file`
  - `model`
  - `preset`

The backend returns a PNG image blob and response headers for model, preset, and processing time.
