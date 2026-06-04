const { runLearningChat, runLearningWorkflow } = require("../realtime-asr/coze-agent");

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

  const token = process.env.COZE_CODE_API_TOKEN || process.env.COZE_API_TOKEN;

  if (!token) {
    res.status(500).json({ error: "Missing COZE_API_TOKEN or COZE_CODE_API_TOKEN" });
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
    const taskMode = normalizeText(body.taskMode);

    if (taskMode === "summary" || taskMode === "quiz" || taskMode === "review") {
      const workflow = await runLearningWorkflow({
        task: taskMode,
        userId,
        parameters: buildChatWorkflowParameters(body, message, userId),
      });

      res.status(200).json({
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
      taskMode: taskMode || normalizeText(body.taskMode) || "auto",
      webSearchEnabled: Boolean(body.webSearchEnabled),
    });

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

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
