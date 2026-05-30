const COZE_API_BASE = process.env.COZE_API_BASE || "https://api.coze.cn";
const DEFAULT_BOT_ID = "7645702499248816168";

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

  const token = process.env.COZE_API_TOKEN;
  const botId = process.env.COZE_BOT_ID || DEFAULT_BOT_ID;

  if (!token) {
    res.status(500).json({ error: "Missing COZE_API_TOKEN" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const message = normalizeText(body.message);

    if (!message) {
      res.status(400).json({ error: "message is required" });
      return;
    }

    const userId = normalizeText(body.studentId) || "baizhi_student";
    const conversationId = normalizeText(body.conversationId);
    const content = buildCozeMessage(body, message);
    const chatUrl = new URL("/v3/chat", COZE_API_BASE);

    if (conversationId) {
      chatUrl.searchParams.set("conversation_id", conversationId);
    }

    const cozeResponse = await fetch(chatUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        bot_id: botId,
        user_id: userId,
        stream: true,
        auto_save_history: true,
        additional_messages: [
          {
            role: "user",
            content,
            content_type: "text",
          },
        ],
      }),
    });

    if (!cozeResponse.ok || !cozeResponse.body) {
      const errorText = await cozeResponse.text();
      res.status(cozeResponse.status).json({
        error: "Coze request failed",
        detail: safeJson(errorText) || errorText,
      });
      return;
    }

    const parsed = await readCozeStream(cozeResponse.body);

    if (parsed.error) {
      res.status(502).json(parsed);
      return;
    }

    res.status(200).json(parsed);
  } catch (error) {
    res.status(500).json({
      error: "Unexpected server error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
};

function buildCozeMessage(body, message) {
  const selectedNoteIds = normalizeList(body.selectedNoteIds);
  const selectedNoteTitles = normalizeList(body.selectedNoteTitles);
  const noteContext = normalizeText(body.noteContext);
  const taskMode = normalizeText(body.taskMode) || "auto";
  const webSearchEnabled = Boolean(body.webSearchEnabled);
  const studentId = normalizeText(body.studentId);
  const conversationId = normalizeText(body.conversationId);

  return [
    "【百智系统上下文】",
    `student_id: ${studentId || ""}`,
    `conversation_id: ${conversationId || ""}`,
    `task_mode: ${taskMode}`,
    `web_search_enabled: ${webSearchEnabled ? "true" : "false"}`,
    `selected_note_ids: ${selectedNoteIds.join(", ")}`,
    `selected_note_titles: ${selectedNoteTitles.join("、")}`,
    "",
    "【选中/检索到的笔记内容】",
    noteContext || "无",
    "",
    "【学生问题】",
    message,
  ].join("\n");
}

async function readCozeStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let answer = "";
  let conversationId = "";
  let chatId = "";
  let usage = null;
  const events = [];

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\n\n/);
    buffer = parts.pop() || "";

    for (const part of parts) {
      const event = parseSseEvent(part);

      if (!event) {
        continue;
      }

      if (event.event === "done" || event.data === "[DONE]") {
        continue;
      }

      const data = safeJson(event.data);

      if (!data) {
        continue;
      }

      events.push({ event: event.event, data });

      if (data.conversation_id) {
        conversationId = data.conversation_id;
      }

      if (data.chat_id || data.id) {
        chatId = data.chat_id || data.id;
      }

      if (event.event === "conversation.message.completed" && data.type === "answer") {
        answer = data.content || answer;
      }

      if (event.event === "conversation.message.delta" && data.type === "answer" && !answer) {
        answer += data.content || "";
      }

      if (event.event === "conversation.chat.completed") {
        usage = data.usage || usage;
      }

      if (event.event === "conversation.chat.failed") {
        return {
          error: "Coze chat failed",
          detail: data,
          conversationId,
          chatId,
        };
      }
    }
  }

  return {
    answer,
    conversationId,
    chatId,
    usage,
    events,
  };
}

function parseSseEvent(chunk) {
  const lines = chunk.split(/\r?\n/);
  let event = "";
  const data = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    }

    if (line.startsWith("data:")) {
      data.push(line.slice(5).trim());
    }
  }

  if (!event && data.length === 0) {
    return null;
  }

  return {
    event,
    data: data.join("\n"),
  };
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normalizeList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => String(item).trim()).filter(Boolean);
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
