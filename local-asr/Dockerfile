FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/ \
    PIP_TRUSTED_HOST=mirrors.aliyun.com \
    FASTER_WHISPER_MODEL=base \
    FASTER_WHISPER_DEVICE=cpu \
    FASTER_WHISPER_COMPUTE_TYPE=int8

WORKDIR /app

RUN sed -i 's|http://deb.debian.org/debian|http://mirrors.aliyun.com/debian|g; s|http://security.debian.org/debian-security|http://mirrors.aliyun.com/debian-security|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --timeout 120 -r requirements.txt

COPY faster_whisper_server.py .

EXPOSE 8000

CMD ["uvicorn", "faster_whisper_server:app", "--host", "0.0.0.0", "--port", "8000"]
