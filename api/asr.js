const DEFAULT_ASR_API_URL = "http://127.0.0.1:8000/asr";
const MAX_AUDIO_BYTES = Number(process.env.ASR_MAX_AUDIO_BYTES || 25 * 1024 * 1024);

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const asrUrl = process.env.ASR_API_URL || DEFAULT_ASR_API_URL;
  const contentType = req.headers["content-type"] || "";

  if (!contentType.includes("multipart/form-data")) {
    res.status(415).json({ error: "multipart/form-data is required" });
    return;
  }

  try {
    const body = await readRequestBody(req);

    if (!body.length) {
      res.status(400).json({ error: "audio file is required" });
      return;
    }

    if (body.length > MAX_AUDIO_BYTES) {
      res.status(413).json({
        error: "audio file is too large",
        maxBytes: MAX_AUDIO_BYTES,
      });
      return;
    }

    const headers = {
      "Content-Type": contentType,
      "Content-Length": String(body.length),
    };

    if (process.env.ASR_API_TOKEN) {
      headers.Authorization = `Bearer ${process.env.ASR_API_TOKEN}`;
    }

    const upstream = await fetch(asrUrl, {
      method: "POST",
      headers,
      body,
    });

    const raw = await upstream.text();
    const payload = safeJson(raw);

    if (!upstream.ok) {
      res.status(upstream.status).json({
        error: "ASR request failed",
        detail: payload || raw,
      });
      return;
    }

    res.status(200).json(normalizeAsrPayload(payload, raw));
  } catch (error) {
    res.status(500).json({
      error: "Unexpected server error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};

async function readRequestBody(req) {
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === "string") {
    return Buffer.from(req.body);
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function normalizeAsrPayload(payload, raw) {
  if (!payload) {
    return {
      text: String(raw || "").trim(),
      segments: [],
      raw,
    };
  }

  const text =
    normalizeText(payload.text) ||
    normalizeText(payload.transcript) ||
    normalizeText(payload.result) ||
    normalizeText(payload.data && payload.data.text) ||
    "";

  const segments = Array.isArray(payload.segments)
    ? payload.segments
    : Array.isArray(payload.data && payload.data.segments)
      ? payload.data.segments
      : [];

  return {
    text,
    segments,
    language: payload.language || (payload.data && payload.data.language) || null,
    duration: payload.duration || (payload.data && payload.data.duration) || null,
    raw: payload,
  };
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
