const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");
const { handleClassAudioRecordsRequest } = require("./class-audio-store");
const { handleClassAudioTaskRequest } = require("./class-audio-tasks");
const { runLearningChat, runLearningWorkflow } = require("./coze-agent");

const PORT = Number(process.env.PORT || 8787);
const APPKEY = process.env.ALIYUN_NLS_APPKEY || "";
const NLS_TOKEN = process.env.ALIYUN_NLS_TOKEN || "";
const ACCESS_KEY_ID = process.env.ALIYUN_ACCESS_KEY_ID || "";
const ACCESS_KEY_SECRET = process.env.ALIYUN_ACCESS_KEY_SECRET || "";
const NLS_META_ENDPOINT = process.env.ALIYUN_NLS_META_ENDPOINT || "https://nls-meta.cn-shanghai.aliyuncs.com";
const NLS_WS_ENDPOINT = process.env.ALIYUN_NLS_WS_ENDPOINT || "wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1";
const SESSION_DIR = process.env.ASR_REALTIME_SESSION_DIR || "/opt/100waytoai/asr-realtime-sessions";
const MAX_FRAME_BYTES = Number(process.env.ASR_REALTIME_MAX_FRAME_BYTES || 64 * 1024);
const MAX_BUFFERED_FRAMES = Number(process.env.ASR_REALTIME_MAX_BUFFERED_FRAMES || 40);

let cachedToken = null;

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;

  if (pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      appkeyConfigured: Boolean(APPKEY),
      tokenConfigured: Boolean(NLS_TOKEN || (ACCESS_KEY_ID && ACCESS_KEY_SECRET)),
      nlsEndpoint: NLS_WS_ENDPOINT,
    });
    return;
  }

  if (pathname === "/api/class-audio-records" || pathname === "/class-audio-records") {
    handleClassAudioRecordsRequest(req, res);
    return;
  }

  if (pathname === "/api/class-audio-tasks" || pathname === "/class-audio-tasks") {
    handleClassAudioTaskRequest(req, res);
    return;
  }

  if (pathname === "/api/coze-chat" || pathname === "/coze-chat") {
    handleCozeChatRequest(req, res).catch((error) => {
      sendJson(res, 500, {
        error: "Unexpected server error",
        detail: error instanceof Error ? error.message : String(error),
      });
    });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (client, req) => {
  const session = createSession(req);
  session.client = client;

  client.on("message", (message, isBinary) => {
    if (isBinary) {
      handleAudioFrame(session, message);
      return;
    }

    handleClientCommand(session, message);
  });

  client.on("close", () => closeSession(session, "client closed"));
  client.on("error", (error) => {
    sendClient(session, { type: "error", message: error.message });
    closeSession(session, "client error");
  });
});

server.listen(PORT, () => {
  try {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  } catch (error) {
    console.error("Failed to prepare ASR session directory:", error.message);
  }
  console.log(`Baizhi realtime ASR server listening on ${PORT}`);
});

function createSession(req) {
  const sessionId = hex32();
  return {
    id: sessionId,
    req,
    client: null,
    nls: null,
    nlsReady: false,
    closing: false,
    finished: false,
    audioQueue: [],
    startedAt: Date.now(),
    sampleRate: 16000,
    format: "pcm",
    partial: "",
    finalByIndex: new Map(),
    segments: [],
  };
}

async function handleClientCommand(session, raw) {
  let command;

  try {
    command = JSON.parse(String(raw));
  } catch {
    sendClient(session, { type: "error", message: "Invalid client message." });
    return;
  }

  if (command.type === "start") {
    session.sampleRate = Number(command.sampleRate || 16000);
    session.format = command.format || "pcm";
    await startNls(session);
    return;
  }

  if (command.type === "stop") {
    stopNls(session);
  }
}

async function startNls(session) {
  if (session.nls) {
    return;
  }

  if (!APPKEY) {
    sendClient(session, { type: "error", message: "ALIYUN_NLS_APPKEY is not configured." });
    return;
  }

  try {
    const token = await getNlsToken();
    const url = `${NLS_WS_ENDPOINT}?token=${encodeURIComponent(token)}`;
    const nls = new WebSocket(url);
    session.nls = nls;

    nls.on("open", () => {
      nls.send(JSON.stringify({
        header: {
          appkey: APPKEY,
          message_id: hex32(),
          task_id: session.id,
          namespace: "SpeechTranscriber",
          name: "StartTranscription",
        },
        payload: {
          format: session.format,
          sample_rate: session.sampleRate,
          enable_intermediate_result: true,
          enable_punctuation_prediction: true,
          enable_inverse_text_normalization: true,
          max_sentence_silence: Number(process.env.ALIYUN_NLS_MAX_SENTENCE_SILENCE || 800),
        },
      }));
    });

    nls.on("message", (message) => handleNlsMessage(session, message));
    nls.on("close", (code, reason) => {
      if (!session.closing) {
        sendClient(session, {
          type: "error",
          message: `阿里云 NLS 连接已关闭：${code} ${String(reason || "")}`.trim(),
        });
      }
      finishSession(session);
    });
    nls.on("error", (error) => {
      sendClient(session, { type: "error", message: `阿里云 NLS 连接失败：${error.message}` });
      finishSession(session);
    });
  } catch (error) {
    sendClient(session, { type: "error", message: error.message });
  }
}

function handleNlsMessage(session, message) {
  let event;

  try {
    event = JSON.parse(String(message));
  } catch {
    return;
  }

  const header = event.header || {};
  const payload = event.payload || {};
  const name = header.name;

  if (header.status && header.status !== 20000000) {
    sendClient(session, {
      type: "error",
      event: name,
      status: header.status,
      message: header.status_message || "NLS request failed.",
    });
    return;
  }

  if (name === "TranscriptionStarted") {
    session.nlsReady = true;
    sendClient(session, { type: "ready", sessionId: session.id });
    flushAudioQueue(session);
    return;
  }

  if (name === "TranscriptionResultChanged") {
    session.partial = payload.result || "";
    sendClient(session, {
      type: "partial",
      index: payload.index,
      text: session.partial,
      transcript: buildTranscript(session, session.partial),
    });
    return;
  }

  if (name === "SentenceEnd") {
    const text = String(payload.result || "").trim();
    if (text) {
      session.finalByIndex.set(payload.index || session.finalByIndex.size + 1, text);
      session.partial = "";
      session.segments.push({
        index: payload.index,
        start: typeof payload.begin_time === "number" ? payload.begin_time / 1000 : null,
        end: typeof payload.time === "number" ? payload.time / 1000 : null,
        text,
        confidence: payload.confidence,
      });
    }
    sendClient(session, {
      type: "final",
      index: payload.index,
      text,
      transcript: buildTranscript(session),
      segments: session.segments,
    });
    return;
  }

  if (name === "TranscriptionCompleted") {
    finishSession(session);
  }
}

function handleAudioFrame(session, message) {
  if (!Buffer.isBuffer(message)) {
    message = Buffer.from(message);
  }

  if (!message.length || message.length > MAX_FRAME_BYTES) {
    return;
  }

  if (session.nlsReady && session.nls && session.nls.readyState === WebSocket.OPEN) {
    session.nls.send(message);
    return;
  }

  if (session.audioQueue.length < MAX_BUFFERED_FRAMES) {
    session.audioQueue.push(message);
  }
}

function flushAudioQueue(session) {
  while (session.audioQueue.length && session.nls && session.nls.readyState === WebSocket.OPEN) {
    session.nls.send(session.audioQueue.shift());
  }
}

function stopNls(session) {
  session.closing = true;

  if (!session.nls || session.nls.readyState !== WebSocket.OPEN) {
    finishSession(session);
    return;
  }

  session.nls.send(JSON.stringify({
    header: {
      appkey: APPKEY,
      message_id: hex32(),
      task_id: session.id,
      namespace: "SpeechTranscriber",
      name: "StopTranscription",
    },
  }));
}

function closeSession(session) {
  session.closing = true;

  if (session.nls && session.nls.readyState === WebSocket.OPEN) {
    try {
      stopNls(session);
    } catch {
      session.nls.close();
    }
  }
}

function finishSession(session) {
  if (session.finished) {
    return;
  }

  session.finished = true;
  const transcript = buildTranscript(session);
  const payload = {
    type: "completed",
    sessionId: session.id,
    text: transcript,
    transcript,
    segments: session.segments,
    duration: Math.max(0, Math.round((Date.now() - session.startedAt) / 1000)),
  };

  persistSession(payload);
  sendClient(session, payload);

  if (session.client && session.client.readyState === WebSocket.OPEN) {
    setTimeout(() => session.client.close(1000, "completed"), 200);
  }

  if (session.nls && session.nls.readyState === WebSocket.OPEN) {
    session.nls.close();
  }
}

function buildTranscript(session, partial = "") {
  const finals = Array.from(session.finalByIndex.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map((entry) => entry[1])
    .filter(Boolean);

  if (partial) {
    finals.push(partial);
  }

  return finals.join("\n").trim();
}

function persistSession(payload) {
  try {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    const file = path.join(SESSION_DIR, `${payload.sessionId}.json`);
    fs.writeFileSync(file, JSON.stringify({ ...payload, savedAt: new Date().toISOString() }, null, 2));
  } catch (error) {
    console.error("Failed to persist ASR session:", error.message);
  }
}

async function getNlsToken() {
  const now = Math.floor(Date.now() / 1000);

  if (NLS_TOKEN) {
    return NLS_TOKEN;
  }

  if (cachedToken && cachedToken.expireTime - 300 > now) {
    return cachedToken.id;
  }

  if (!ACCESS_KEY_ID || !ACCESS_KEY_SECRET) {
    throw new Error("ALIYUN_NLS_TOKEN or ALIYUN_ACCESS_KEY_ID/ALIYUN_ACCESS_KEY_SECRET is required.");
  }

  const params = {
    AccessKeyId: ACCESS_KEY_ID,
    Action: "CreateToken",
    Format: "JSON",
    RegionId: process.env.ALIYUN_NLS_META_REGION || "cn-shanghai",
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: hex32(),
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: "2019-02-28",
  };
  params.Signature = signAliyunRpc("GET", "/", params, ACCESS_KEY_SECRET);

  const url = `${NLS_META_ENDPOINT}/?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || !data.Token || !data.Token.Id) {
    throw new Error(data.Message || data.ErrMsg || "Failed to create Aliyun NLS token.");
  }

  cachedToken = {
    id: data.Token.Id,
    expireTime: Number(data.Token.ExpireTime || now + 3600),
  };
  return cachedToken.id;
}

function signAliyunRpc(method, pathname, params, secret) {
  const canonicalizedQuery = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
  const stringToSign = `${method}&${percentEncode(pathname)}&${percentEncode(canonicalizedQuery)}`;
  return crypto.createHmac("sha1", `${secret}&`).update(stringToSign).digest("base64");
}

function percentEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

function sendClient(session, payload) {
  if (session.client && session.client.readyState === WebSocket.OPEN) {
    session.client.send(JSON.stringify(payload));
  }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

async function handleCozeChatRequest(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!process.env.COZE_CODE_API_TOKEN && !process.env.COZE_API_TOKEN) {
    sendJson(res, 500, { error: "Missing COZE_API_TOKEN or COZE_CODE_API_TOKEN" });
    return;
  }

  const body = safeJson((await readRequestBody(req)).toString("utf8")) || {};
  const message = normalizeText(body.message);

  if (!message) {
    sendJson(res, 400, { error: "message is required" });
    return;
  }

  const userId = normalizeText(body.studentId) || "baizhi_student";
  const conversationId = normalizeText(body.conversationId);
  const taskMode = normalizeText(body.taskMode);

  if (taskMode === "summary" || taskMode === "quiz" || taskMode === "review") {
    const workflow = await runLearningWorkflow({
      task: taskMode,
      userId,
      parameters: buildChatWorkflowParameters(body, message, userId),
    });

    sendJson(res, 200, {
      answer: workflow.answer,
      artifact: workflow.artifact,
      conversationId: workflow.coze.conversationId || conversationId,
      chatId: workflow.coze.executeId || workflow.coze.chatId || "",
      usage: workflow.coze.usage,
      coze: workflow.coze,
    });
    return;
  }

  const parsed = await runLearningChat({
    message,
    userId,
    conversationId,
    noteContext: normalizeText(body.noteContext),
    selectedNoteIds: normalizeList(body.selectedNoteIds),
    selectedNoteTitles: normalizeList(body.selectedNoteTitles),
    taskMode: taskMode || "auto",
    webSearchEnabled: Boolean(body.webSearchEnabled),
  });

  sendJson(res, 200, parsed);
}

function buildChatWorkflowParameters(body, message, userId) {
  const selectedNoteIds = normalizeList(body.selectedNoteIds);
  const selectedNoteTitles = normalizeList(body.selectedNoteTitles);
  const noteContext = normalizeText(body.noteContext);
  return {
    task_mode: normalizeText(body.taskMode),
    student_id: userId,
    user_message: message,
    selected_note_ids: selectedNoteIds,
    selected_note_titles: selectedNoteTitles,
    transcript: noteContext,
    note_context: noteContext,
    web_search_enabled: Boolean(body.webSearchEnabled),
  };
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeList(value) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
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

function hex32() {
  return crypto.randomBytes(16).toString("hex");
}
