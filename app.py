from __future__ import annotations

import os
import time
from functools import lru_cache
from io import BytesIO

import numpy as np
import torch
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from PIL import Image, ImageEnhance, ImageOps

from colorizers import eccv16, load_img, postprocess_tens, preprocess_img, siggraph17


PRESETS = {
    "natural": "Balanced output close to the model prediction.",
    "vivid": "Higher saturation and contrast.",
    "warm": "Warmer tones with a slight color boost.",
    "cool": "Cooler tones with a softer look.",
    "film": "Muted, cinematic, slightly faded.",
}

MODELS = {
    "eccv16": "ECCV 2016 model",
    "siggraph17": "SIGGRAPH 2017 model",
}


def _parse_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "*").strip()
    if raw == "*":
        return ["*"]
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def _image_to_png_bytes(image: np.ndarray) -> bytes:
    buffer = BytesIO()
    Image.fromarray(image).save(buffer, format="PNG")
    return buffer.getvalue()


def _apply_preset(image: np.ndarray, preset: str) -> np.ndarray:
    pil_image = Image.fromarray(np.clip(image * 255.0, 0, 255).astype(np.uint8))

    if preset == "natural":
        adjusted = pil_image
    elif preset == "vivid":
        adjusted = ImageEnhance.Color(pil_image).enhance(1.25)
        adjusted = ImageEnhance.Contrast(adjusted).enhance(1.08)
    elif preset == "warm":
        arr = np.asarray(pil_image).astype(np.float32)
        arr[..., 0] *= 1.08
        arr[..., 1] *= 1.02
        arr[..., 2] *= 0.93
        adjusted = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        adjusted = ImageEnhance.Color(adjusted).enhance(1.06)
    elif preset == "cool":
        arr = np.asarray(pil_image).astype(np.float32)
        arr[..., 0] *= 0.95
        arr[..., 1] *= 1.00
        arr[..., 2] *= 1.08
        adjusted = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        adjusted = ImageEnhance.Color(adjusted).enhance(0.95)
    elif preset == "film":
        adjusted = ImageEnhance.Color(pil_image).enhance(0.82)
        adjusted = ImageEnhance.Contrast(adjusted).enhance(0.94)
        adjusted = ImageEnhance.Brightness(adjusted).enhance(1.02)
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported preset: {preset}")

    return np.asarray(adjusted)


class ColorizationService:
    def __init__(self) -> None:
        force_cpu = os.getenv("FORCE_CPU", "0") == "1"
        use_cuda = torch.cuda.is_available() and not force_cpu
        self.device = torch.device("cuda" if use_cuda else "cpu")

        self.models = {
            "eccv16": eccv16(pretrained=True).eval().to(self.device),
            "siggraph17": siggraph17(pretrained=True).eval().to(self.device),
        }

    @torch.inference_mode()
    def colorize(self, image_bytes: bytes, model_name: str, preset: str) -> np.ndarray:
        if model_name not in self.models:
            raise HTTPException(status_code=400, detail=f"Unsupported model: {model_name}")
        if preset not in PRESETS:
            raise HTTPException(status_code=400, detail=f"Unsupported preset: {preset}")

        try:
            rgb_image = Image.open(BytesIO(image_bytes))
            rgb_image = ImageOps.exif_transpose(rgb_image).convert("RGB")
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Uploaded file is not a valid image.") from exc

        rgb_array = np.asarray(rgb_image)
        tens_l_orig, tens_l_rs = preprocess_img(rgb_array, HW=(256, 256))
        tens_l_rs = tens_l_rs.to(self.device)

        model = self.models[model_name]
        out_ab = model(tens_l_rs).cpu()
        rgb_output = postprocess_tens(tens_l_orig, out_ab)
        return _apply_preset(rgb_output, preset)


@lru_cache(maxsize=1)
def get_service() -> ColorizationService:
    return ColorizationService()


app = FastAPI(title="Colorization Backend", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, object]:
    return {
        "service": "colorization-backend",
        "models": list(MODELS.keys()),
        "presets": list(PRESETS.keys()),
    }


@app.get("/health")
def health() -> dict[str, str]:
    service = get_service()
    return {"status": "ok", "device": service.device.type}


@app.get("/api/options")
def options() -> dict[str, object]:
    return {
        "models": [{"id": key, "label": value} for key, value in MODELS.items()],
        "presets": [{"id": key, "label": value} for key, value in PRESETS.items()],
    }


@app.post("/api/colorize")
async def colorize(
    file: UploadFile = File(...),
    model: str = Form("siggraph17"),
    preset: str = Form("natural"),
) -> Response:
    service = get_service()
    started_at = time.perf_counter()
    image_bytes = await file.read()
    result = service.colorize(image_bytes=image_bytes, model_name=model, preset=preset)
    elapsed_ms = int((time.perf_counter() - started_at) * 1000)

    headers = {
        "X-Model": model,
        "X-Preset": preset,
        "X-Processing-Time-Ms": str(elapsed_ms),
        "Cache-Control": "no-store",
    }
    return Response(content=_image_to_png_bytes(result), media_type="image/png", headers=headers)


@app.exception_handler(HTTPException)
def http_exception_handler(_: object, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "7860"))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)