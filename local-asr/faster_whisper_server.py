import os
import tempfile
from functools import lru_cache
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel


DEFAULT_MODEL = os.getenv("FASTER_WHISPER_MODEL", "small")
DEVICE = os.getenv("FASTER_WHISPER_DEVICE", "auto")
COMPUTE_TYPE = os.getenv("FASTER_WHISPER_COMPUTE_TYPE", "auto")

app = FastAPI(title="Baizhi Local ASR", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ASR_ALLOWED_ORIGINS", "*").split(","),
    allow_credentials=False,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["*"],
)


@lru_cache(maxsize=2)
def get_model(model_name: str) -> WhisperModel:
    return WhisperModel(model_name, device=DEVICE, compute_type=COMPUTE_TYPE)


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": DEFAULT_MODEL,
        "device": DEVICE,
        "computeType": COMPUTE_TYPE,
    }


@app.post("/asr")
async def transcribe(
    file: UploadFile = File(...),
    language: Optional[str] = Form("zh"),
    model: Optional[str] = Form(None),
):
    model_name = model or DEFAULT_MODEL
    suffix = os.path.splitext(file.filename or "")[1] or ".webm"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_path = temp_file.name
        temp_file.write(await file.read())

    try:
        segments_iter, info = get_model(model_name).transcribe(
            temp_path,
            language=language or None,
            vad_filter=True,
            beam_size=int(os.getenv("FASTER_WHISPER_BEAM_SIZE", "5")),
        )
        segments = [
            {
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": segment.text.strip(),
            }
            for segment in segments_iter
        ]
        text = "\n".join(segment["text"] for segment in segments if segment["text"]).strip()

        return {
            "text": text,
            "segments": segments,
            "language": info.language,
            "duration": info.duration,
            "model": model_name,
        }
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass
