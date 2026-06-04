const { createClassAudioStore } = require("./class-audio-store");
const { generateLearningArtifact } = require("./coze-agent");

const DEFAULT_DATA_DIR = process.env.CLASS_AUDIO_DATA_DIR || "/opt/100waytoai/class-audio-records";
const DEFAULT_DATABASE_URL = process.env.CLASS_AUDIO_DATABASE_URL || process.env.DATABASE_URL || "";
const DEFAULT_ASR_API_URL = process.env.ASR_API_URL || "http://127.0.0.1:8000/asr";
const DEFAULT_ASR_PROVIDER = process.env.ASR_PROVIDER || "local";

async function handleClassAudioTaskRequest(req, res, options = {}) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = safeJson((await readRequestBody(req)).toString("utf8")) || {};
    const recordId = normalizeText(body.recordId || body.id);
    const task = normalizeText(body.task);
    const userId = normalizeText(body.userId);

    if (!recordId) {
      sendJson(res, 400, { error: "recordId is required" });
      return;
    }

    if (!task) {
      sendJson(res, 400, { error: "task is required" });
      return;
    }

    const store = await createClassAudioStore({
      dataDir: options.dataDir || DEFAULT_DATA_DIR,
      databaseUrl: options.databaseUrl || DEFAULT_DATABASE_URL,
    });
    const record = await store.getRecord(recordId);

    if (!record) {
      sendJson(res, 404, { error: "Audio record not found" });
      return;
    }

    if (userId && record.userId && userId !== record.userId) {
      sendJson(res, 403, { error: "Audio record does not belong to current user" });
      return;
    }

    if (task === "transcribe") {
      const result = await runTranscriptionTask(store, record);
      sendJson(res, 200, result);
      return;
    }

    if (task === "summary" || task === "quiz" || task === "review") {
      const result = await runArtifactTask(store, record, task, userId);
      sendJson(res, 200, result);
      return;
    }

    sendJson(res, 400, { error: "Unsupported task" });
  } catch (error) {
    sendJson(res, error && error.statusCode ? error.statusCode : 500, {
      error: "Unexpected server error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runTranscriptionTask(store, record) {
  record.processing = {
    ...normalizeObject(record.processing),
    fineTranscription: "running",
    diarization: "running",
  };
  record.statusLabel = "精细转写中";
  record.updatedAt = new Date().toISOString();
  await store.updateRecord(record);

  try {
    const asr = await requestFineTranscription(store, record);
    const text = normalizeText(asr.text);

    if (!text) {
      throw new Error("ASR 没有返回可用文本");
    }

    record.transcript = text;
    record.content = text;
    record.segments = normalizeSegments(asr.segments);
    record.duration = Number(asr.duration || record.duration || 0);
    record.status = "waiting_summary";
    record.statusLabel = "待AI总结";
    record.stageIndex = 3;
    record.processing = {
      ...normalizeObject(record.processing),
      fineTranscription: "done",
      diarization: record.segments.some((segment) => segment.speakerId != null) ? "done" : "unavailable",
      transcribedAt: new Date().toISOString(),
      asrLanguage: asr.language || null,
      asrProvider: asr.provider || DEFAULT_ASR_PROVIDER,
      asrTaskId: asr.taskId || null,
    };
    record.updatedAt = new Date().toISOString();
    await store.updateRecord(record);

    return { record: publicRecord(record), asr };
  } catch (error) {
    record.processing = {
      ...normalizeObject(record.processing),
      fineTranscription: "failed",
      diarization: "failed",
      errors: {
        ...(normalizeObject(record.processing).errors || {}),
        transcribe: error instanceof Error ? error.message : String(error),
      },
    };
    record.updatedAt = new Date().toISOString();
    await store.updateRecord(record);
    throw error;
  }
}

async function runArtifactTask(store, record, task, userId) {
  const transcript = normalizeText(record.transcript || record.content);

  if (!transcript) {
    sendTaskError(record, task, "请先完成精细转写和说话人分离");
    await store.updateRecord(record);
    const error = new Error("Transcription is required before generating learning artifacts");
    error.statusCode = 409;
    throw error;
  }

  record.processing = {
    ...normalizeObject(record.processing),
    [task]: "running",
  };
  record.updatedAt = new Date().toISOString();
  await store.updateRecord(record);

  try {
    const result = await generateLearningArtifact({ task, record, userId });
    record.artifacts = {
      ...normalizeObject(record.artifacts),
      [task]: result.artifact,
    };
    record.processing = {
      ...normalizeObject(record.processing),
      [task]: "done",
      [`${task}GeneratedAt`]: new Date().toISOString(),
      coze: {
        ...(normalizeObject(record.processing).coze || {}),
        [task]: result.coze,
      },
    };
    if (task === "summary") {
      const summaryTitle = normalizeText(result.artifact && result.artifact.title);
      if (summaryTitle) {
        record.title = summaryTitle;
      }
      record.status = "stored";
      record.statusLabel = "已入库";
      record.stageIndex = Math.max(Number(record.stageIndex || 0), 3);
    }
    record.updatedAt = new Date().toISOString();
    await store.updateRecord(record);

    return {
      task,
      artifact: result.artifact,
      record: publicRecord(record),
      coze: result.coze,
    };
  } catch (error) {
    sendTaskError(record, task, error instanceof Error ? error.message : String(error));
    record.updatedAt = new Date().toISOString();
    await store.updateRecord(record);
    throw error;
  }
}

function sendTaskError(record, task, message) {
  record.processing = {
    ...normalizeObject(record.processing),
    [task]: "failed",
    errors: {
      ...(normalizeObject(record.processing).errors || {}),
      [task]: message,
    },
  };
}

async function requestFineTranscription(store, record) {
  if (DEFAULT_ASR_PROVIDER === "aliyun_fun_asr") {
    return requestAliyunFunAsr(record);
  }

  const audio = await store.getAudio(record.id);

  if (!audio) {
    throw new Error("Audio file not found");
  }

  const audioBuffer = audio.data || (audio.stream ? await streamToBuffer(audio.stream) : null);

  if (!audioBuffer || !audioBuffer.length) {
    throw new Error("Audio file is empty");
  }

  return requestLocalFineTranscription({
    audioBuffer,
    mimeType: audio.mimeType || record.mimeType || "audio/webm",
    fileName: record.fileName || "class-recording.webm",
  });
}

async function requestLocalFineTranscription({ audioBuffer, mimeType, fileName }) {
  const boundary = `----baizhi-asr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const body = buildMultipartBody(boundary, [
    { name: "language", value: "zh" },
    { name: "diarization", value: "true" },
    { name: "speaker_diarization", value: "true" },
    { name: "return_segments", value: "true" },
    process.env.BAIZHI_ASR_MODEL ? { name: "model", value: process.env.BAIZHI_ASR_MODEL } : null,
    {
      name: "file",
      fileName,
      contentType: mimeType,
      data: audioBuffer,
    },
  ].filter(Boolean));
  const headers = {
    "Content-Type": `multipart/form-data; boundary=${boundary}`,
    "Content-Length": String(body.length),
  };

  if (process.env.ASR_API_TOKEN) {
    headers.Authorization = `Bearer ${process.env.ASR_API_TOKEN}`;
  }

  const response = await fetch(DEFAULT_ASR_API_URL, {
    method: "POST",
    headers,
    body,
  });
  const raw = await response.text();
  const payload = safeJson(raw);

  if (!response.ok) {
    throw new Error(`ASR request failed: ${raw || response.status}`);
  }

  return {
    ...normalizeAsrPayload(payload, raw),
    provider: "local",
  };
}

async function requestAliyunFunAsr(record) {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.ALIYUN_DASHSCOPE_API_KEY || "";

  if (!apiKey) {
    throw new Error("Missing DASHSCOPE_API_KEY for Aliyun Fun-ASR");
  }

  const fileUrl = publicAudioUrl(record);
  const baseUrl = normalizeText(process.env.DASHSCOPE_API_BASE) || "https://dashscope.aliyuncs.com/api/v1";
  const submitUrl = new URL("/api/v1/services/audio/asr/transcription", baseUrl).toString();
  const taskBaseUrl = new URL("/api/v1/tasks/", baseUrl).toString();
  const model = process.env.ALIYUN_FUN_ASR_MODEL || "fun-asr";
  const speakerCount = Number(process.env.ALIYUN_FUN_ASR_SPEAKER_COUNT || 0);
  const parameters = {
    channel_id: [Number(process.env.ALIYUN_FUN_ASR_CHANNEL_ID || 0)],
    diarization_enabled: process.env.ALIYUN_FUN_ASR_DIARIZATION !== "false",
  };

  if (speakerCount > 0) {
    parameters.speaker_count = speakerCount;
  }

  if (process.env.ALIYUN_FUN_ASR_VOCABULARY_ID) {
    parameters.vocabulary_id = process.env.ALIYUN_FUN_ASR_VOCABULARY_ID;
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-DashScope-Async": "enable",
  };
  const submitResponse = await fetch(submitUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      input: {
        file_urls: [fileUrl],
      },
      parameters,
    }),
  });
  const submitRaw = await submitResponse.text();
  const submitPayload = safeJson(submitRaw);

  if (!submitResponse.ok || !submitPayload || !submitPayload.output || !submitPayload.output.task_id) {
    throw new Error(`Aliyun Fun-ASR task submission failed: ${submitRaw || submitResponse.status}`);
  }

  const taskId = submitPayload.output.task_id;
  const taskResult = await pollAliyunFunAsrTask({
    taskId,
    taskUrl: taskBaseUrl + encodeURIComponent(taskId),
    headers,
  });
  const resultItem = firstSuccessfulAliyunResult(taskResult);

  if (!resultItem || !resultItem.transcription_url) {
    throw new Error(`Aliyun Fun-ASR task has no transcription_url: ${JSON.stringify(taskResult)}`);
  }

  const resultResponse = await fetch(resultItem.transcription_url);
  const resultRaw = await resultResponse.text();
  const resultJson = safeJson(resultRaw);

  if (!resultResponse.ok || !resultJson) {
    throw new Error(`Aliyun Fun-ASR result download failed: ${resultRaw || resultResponse.status}`);
  }

  return normalizeAliyunFunAsrPayload(resultJson, {
    taskId,
    taskResult,
    resultItem,
    provider: "aliyun_fun_asr",
    model,
  });
}

async function pollAliyunFunAsrTask({ taskId, taskUrl, headers }) {
  const maxAttempts = Number(process.env.ALIYUN_FUN_ASR_POLL_MAX_ATTEMPTS || 90);
  const intervalMs = Number(process.env.ALIYUN_FUN_ASR_POLL_INTERVAL_MS || 3000);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(intervalMs);
    }

    const response = await fetch(taskUrl, {
      method: process.env.ALIYUN_FUN_ASR_QUERY_METHOD || "POST",
      headers,
    });
    const raw = await response.text();
    const payload = safeJson(raw);

    if (!response.ok || !payload) {
      throw new Error(`Aliyun Fun-ASR task query failed: ${raw || response.status}`);
    }

    const output = payload.output || payload;
    const status = output.task_status || payload.task_status;

    if (status === "SUCCEEDED") {
      return output;
    }

    if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
      throw new Error(`Aliyun Fun-ASR task ${taskId} ${status}: ${raw}`);
    }
  }

  throw new Error(`Aliyun Fun-ASR task ${taskId} timed out`);
}

function firstSuccessfulAliyunResult(taskResult) {
  const results = Array.isArray(taskResult.results) ? taskResult.results : [];
  return results.find((item) => item && item.subtask_status === "SUCCEEDED") || results[0] || null;
}

function normalizeAliyunFunAsrPayload(payload, meta) {
  const transcripts = Array.isArray(payload.transcripts) ? payload.transcripts : [];
  const segments = [];
  const textParts = [];

  transcripts.forEach((transcript, transcriptIndex) => {
    if (transcript && transcript.text) {
      textParts.push(String(transcript.text).trim());
    }

    const sentences = Array.isArray(transcript && transcript.sentences) ? transcript.sentences : [];
    sentences.forEach((sentence, sentenceIndex) => {
      const text = normalizeText(sentence && sentence.text);

      if (!text) {
        return;
      }

      segments.push({
        index: segments.length + 1,
        start: typeof sentence.begin_time === "number" ? sentence.begin_time / 1000 : null,
        end: typeof sentence.end_time === "number" ? sentence.end_time / 1000 : null,
        text,
        speakerId: sentence.speaker_id == null ? null : sentence.speaker_id,
        speaker: sentence.speaker_id == null ? "Speaker A" : speakerName(sentence.speaker_id),
        sentenceId: sentence.sentence_id == null ? `${transcriptIndex + 1}-${sentenceIndex + 1}` : sentence.sentence_id,
        words: Array.isArray(sentence.words) ? sentence.words : [],
      });
    });
  });

  const text = textParts.filter(Boolean).join("\n").trim() ||
    segments.map((segment) => segment.text).join("\n").trim();
  const durationMs = payload.properties && payload.properties.original_duration_in_milliseconds;

  return {
    text,
    segments,
    language: payload.properties && payload.properties.language ? payload.properties.language : null,
    duration: typeof durationMs === "number" ? durationMs / 1000 : null,
    provider: meta.provider,
    model: meta.model,
    taskId: meta.taskId,
    raw: {
      result: payload,
      taskResult: meta.taskResult,
      resultItem: meta.resultItem,
    },
  };
}

function publicAudioUrl(record) {
  const audioUrl = normalizeText(record.audioUrl);

  if (/^https?:\/\//i.test(audioUrl) || audioUrl.startsWith("oss://")) {
    return audioUrl;
  }

  const base = normalizeText(
    process.env.CLASS_AUDIO_PUBLIC_BASE_URL ||
    process.env.ALIYUN_ASR_AUDIO_URL_BASE ||
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_PUBLIC_URL ||
    process.env.SITE_URL,
  );

  if (!base) {
    throw new Error("Aliyun Fun-ASR requires a public audio URL. Configure CLASS_AUDIO_PUBLIC_BASE_URL or store record.audioUrl as an absolute URL.");
  }

  const url = new URL(audioUrl || `/api/class-audio-records?id=${encodeURIComponent(record.id)}&asset=audio`, base);
  return url.toString();
}

function buildMultipartBody(boundary, parts) {
  const chunks = [];

  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));

    if (part.data) {
      chunks.push(Buffer.from(
        `Content-Disposition: form-data; name="${part.name}"; filename="${escapeHeader(part.fileName)}"\r\n` +
        `Content-Type: ${part.contentType || "application/octet-stream"}\r\n\r\n`,
      ));
      chunks.push(Buffer.isBuffer(part.data) ? part.data : Buffer.from(part.data));
      chunks.push(Buffer.from("\r\n"));
    } else {
      chunks.push(Buffer.from(
        `Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value || ""}\r\n`,
      ));
    }
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
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

  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  return {
    text:
      normalizeText(payload.text) ||
      normalizeText(payload.transcript) ||
      normalizeText(payload.result) ||
      normalizeText(data.text),
    segments: Array.isArray(payload.segments)
      ? payload.segments
      : Array.isArray(data.segments)
        ? data.segments
        : [],
    language: payload.language || data.language || null,
    duration: payload.duration || data.duration || null,
    raw: payload,
  };
}

function normalizeSegments(segments) {
  if (!Array.isArray(segments)) {
    return [];
  }

  return segments.map((segment, index) => {
    const text = normalizeText(segment && segment.text);

    if (!text) {
      return null;
    }

    return {
      index: segment.index == null ? index + 1 : segment.index,
      start: typeof segment.start === "number" ? segment.start : null,
      end: typeof segment.end === "number" ? segment.end : null,
      text,
      speakerId: segment.speakerId == null && segment.speaker_id == null ? null : (segment.speakerId ?? segment.speaker_id),
      speaker: normalizeSpeaker(segment, index),
      confidence: segment.confidence == null ? null : segment.confidence,
    };
  }).filter(Boolean);
}

function normalizeSpeaker(segment, index) {
  const raw = segment && (segment.speaker || segment.speakerLabel || segment.speaker_label || segment.speakerId || segment.speaker_id);

  if (raw == null || raw === "") {
    return "Speaker A";
  }

  const value = String(raw).trim();

  if (/^speaker\s+/i.test(value)) {
    return value.replace(/^speaker/i, "Speaker");
  }

  if (/^[A-Z]$/i.test(value)) {
    return `Speaker ${value.toUpperCase()}`;
  }

  if (/^\d+$/.test(value)) {
    return `Speaker ${String.fromCharCode(65 + (Number(value) || index) % 26)}`;
  }

  return value;
}

function speakerName(id) {
  const number = Number(id);

  if (Number.isFinite(number) && number >= 0) {
    return `Speaker ${String.fromCharCode(65 + (number % 26))}`;
  }

  return `Speaker ${String(id)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readRequestBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function publicRecord(record) {
  const clone = { ...record };
  delete clone.audioPath;
  return clone;
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function escapeHeader(value) {
  return String(value || "file").replace(/"/g, "%22");
}

function safeJson(value) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(status === 204 ? "" : JSON.stringify(payload));
}

module.exports = {
  handleClassAudioTaskRequest,
};
