# Colorization

A full-stack application for colorizing grayscale images using deep learning models, with an editorial and cinematic user interface.

## Overview

This project combines a Python-based machine learning backend with a modern React frontend to provide an interactive image colorization service. Users can upload grayscale images, select from different colorization models and presets, and view results with a side-by-side comparison slider.

## Features

- Multiple colorization models and presets
- Interactive before/after comparison slider
- Archival noir aesthetic with bronze highlights
- FastAPI backend with Hugging Face Space deployment
- Vite + React responsive frontend
- Docker containerization support

## Technology Stack

- Python (33.2%) - Backend and ML models
- JavaScript (29.4%) - Frontend logic
- CSS (35.4%) - Styling and UI
- HTML (1.3%) - Markup
- Dockerfile (0.7%) - Containerization

## Quick Start

### Backend Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the backend:
```bash
python app.py
```

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
cp .env.example .env
```

3. Configure backend URL in `.env`:
```bash
VITE_BACKEND_URL=https://your-backend-url
```

4. Start development server:
```bash
npm run dev
```

## API Endpoints

- `GET /api/options` - Returns available models and presets
- `POST /api/colorize` - Colorizes an image (multipart form data with `file`, `model`, `preset`)

## Deployment

### Frontend (Vercel)

1. Connect repository to Vercel
2. Set root directory to `frontend`
3. Add environment variable `VITE_BACKEND_URL`
4. Deploy automatically on push

### Backend (Hugging Face Spaces)

Deploy using Hugging Face Spaces for serverless ML inference.

## Project Structure

- `backend/` - FastAPI application
- `frontend/` - Vite + React application
- `models/` - Colorization models
- `Dockerfile` - Container configuration

## License

MIT

## Author

arhamheer
