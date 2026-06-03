# 本地 faster-whisper ASR

启动本地转写服务：

```bash
cd local-asr
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn faster_whisper_server:app --host 127.0.0.1 --port 8000
```

默认模型是 `small`，可按机器性能调整：

```bash
FASTER_WHISPER_MODEL=base \
FASTER_WHISPER_DEVICE=auto \
FASTER_WHISPER_COMPUTE_TYPE=auto \
uvicorn faster_whisper_server:app --host 127.0.0.1 --port 8000
```

前端录音会走：

```bash
/api/asr -> http://127.0.0.1:8000/asr
```

健康检查：

```bash
curl http://127.0.0.1:8000/health
```

接口格式：

```bash
curl -F "file=@sample.webm" -F "language=zh" http://127.0.0.1:8000/asr
```

Docker 启动：

```bash
docker build -t baizhi-faster-whisper-asr .
docker run -d --name baizhi-faster-whisper-asr \
  --restart unless-stopped \
  -p 127.0.0.1:8000:8000 \
  -e FASTER_WHISPER_MODEL=base \
  -e FASTER_WHISPER_DEVICE=cpu \
  -e FASTER_WHISPER_COMPUTE_TYPE=int8 \
  baizhi-faster-whisper-asr
```
