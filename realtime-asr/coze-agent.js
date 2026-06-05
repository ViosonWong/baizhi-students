const COZE_API_BASE = process.env.COZE_API_BASE || "https://api.coze.cn";
const DEFAULT_BOT_ID = "7647425305157615662";
const DEFAULT_COZE_CODE_BASE_URL = "https://9x8p8tz864.coze.site";

async function generateLearningArtifact({ task, record, userId }) {
  const normalizedTask = normalizeTask(task);
  const token = cozeToken();
  const botId = process.env.COZE_BOT_ID || DEFAULT_BOT_ID;

  if (!token) {
    throw new Error("Missing COZE_API_TOKEN or COZE_CODE_API_TOKEN");
  }

  const workflowId = workflowIdForTask(normalizedTask);

  if (workflowId && cozeAgentProvider() === "workflow") {
    const result = await runCozeWorkflow({
      token,
      botId,
      task: normalizedTask,
      workflowId,
      parameters: buildWorkflowParameters(normalizedTask, record, userId),
    });

    return {
      task: normalizedTask,
      artifact: parseJsonAnswer(result.data),
      coze: {
        mode: "workflow",
        workflowId,
        executeId: result.executeId,
        debugUrl: result.debugUrl,
        usage: result.usage,
      },
    };
  }

  if (cozeAgentProvider() === "workflow" && process.env.COZE_ARTIFACT_FALLBACK_TO_CHAT !== "true") {
    throw new Error(`Missing Coze workflow id for ${normalizedTask}. Configure ${workflowEnvName(normalizedTask)}.`);
  }

  const answer = await callLearningAgent({
    token,
    botId,
    userId: userId || record.userId || "baizhi_student",
    content: buildArtifactPrompt(normalizedTask, record),
  });
  const artifact = parseJsonAnswer(answer.answer);

  return {
    task: normalizedTask,
    artifact,
    coze: {
      mode: answer.mode || cozeAgentProvider(),
      conversationId: answer.conversationId,
      chatId: answer.chatId,
      usage: answer.usage,
    },
  };
}

async function runLearningWorkflow({ task, parameters, userId }) {
  const normalizedTask = normalizeTask(task);
  const token = cozeToken();
  const botId = process.env.COZE_BOT_ID || DEFAULT_BOT_ID;
  const workflowId = workflowIdForTask(normalizedTask);

  if (!token) {
    throw new Error("Missing COZE_API_TOKEN or COZE_CODE_API_TOKEN");
  }

  if (workflowId && cozeAgentProvider() === "workflow") {
    const result = await runCozeWorkflow({
      token,
      botId,
      task: normalizedTask,
      workflowId,
      parameters: parameters || { userId: userId || "baizhi_student" },
    });

    return {
      task: normalizedTask,
      answer: stringifyArtifactForChat(parseJsonAnswer(result.data), normalizedTask),
      artifact: parseJsonAnswer(result.data),
      coze: {
        mode: "workflow",
        workflowId,
        executeId: result.executeId,
        debugUrl: result.debugUrl,
        usage: result.usage,
      },
    };
  }

  if (cozeAgentProvider() === "workflow") {
    throw new Error(`Missing Coze workflow id for ${normalizedTask}. Configure ${workflowEnvName(normalizedTask)}.`);
  }

  const content = buildArtifactPromptFromParameters(normalizedTask, parameters || {});
  const result = await callLearningAgent({
    token,
    botId,
    userId: userId || parameters.student_id || "baizhi_student",
    content,
  });
  const artifact = parseJsonAnswer(result.answer);

  return {
    task: normalizedTask,
    answer: stringifyArtifactForChat(artifact, normalizedTask),
    artifact,
    coze: {
      mode: result.mode,
      conversationId: result.conversationId,
      chatId: result.chatId,
      usage: result.usage,
    },
  };
}

async function runLearningChat({ message, userId, conversationId, noteContext, selectedNoteIds, selectedNoteTitles, taskMode, webSearchEnabled }) {
  const token = cozeToken();
  const botId = process.env.COZE_BOT_ID || DEFAULT_BOT_ID;

  if (!token) {
    throw new Error("Missing COZE_API_TOKEN or COZE_CODE_API_TOKEN");
  }

  const content = buildChatPrompt({
    message,
    userId,
    conversationId,
    noteContext,
    selectedNoteIds,
    selectedNoteTitles,
    taskMode,
    webSearchEnabled,
  });

  return callLearningAgent({
    token,
    botId,
    userId: userId || "baizhi_student",
    conversationId,
    content,
  });
}

async function callLearningAgent({ token, botId, userId, content, conversationId }) {
  if (cozeAgentProvider() === "coze_code") {
    return callCozeCodeAgent({ token, userId, content, conversationId });
  }

  return callCozeAgent({ token, botId, userId, content, conversationId });
}

async function runCozeWorkflow({ token, botId, workflowId, parameters }) {
  const url = new URL("/v1/workflow/run", COZE_API_BASE);
  const requestParameters = process.env.COZE_WORKFLOW_PARAMETERS_FORMAT === "object"
    ? parameters
    : JSON.stringify(parameters || {});
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workflow_id: workflowId,
      bot_id: botId || undefined,
      parameters: requestParameters,
    }),
  });
  const raw = await response.text();
  const payload = safeJson(raw);

  if (!response.ok) {
    throw new Error(`Coze workflow request failed: ${raw || response.status}`);
  }

  if (!payload) {
    throw new Error(`Coze workflow returned non-JSON response: ${raw}`);
  }

  if (payload.code && payload.code !== 0) {
    throw new Error(`Coze workflow failed: ${payload.msg || payload.code}`);
  }

  return {
    data: payload.data,
    executeId: payload.execute_id,
    debugUrl: payload.debug_url,
    usage: payload.token ? { token_count: payload.token } : null,
    raw: payload,
  };
}

function buildWorkflowParameters(task, record, userId) {
  const transcript = String(record.transcript || record.content || "").trim();
  const segments = Array.isArray(record.segments) ? record.segments : [];
  const meta = record.meta || {};

  return {
    task_mode: task,
    record_id: record.id || "",
    student_id: userId || record.userId || "baizhi_student",
    title: record.title || "课堂录音",
    course: meta.course || "",
    teacher: meta.teacher || "",
    school: meta.school || "",
    classroom: meta.classroom || "",
    transcript,
    segments,
    schema: safeJson(artifactSchemaText(task)),
    summary: record.artifacts && record.artifacts.summary ? record.artifacts.summary : null,
    quiz: record.artifacts && record.artifacts.quiz ? record.artifacts.quiz : null,
  };
}

async function callCozeAgent({ token, botId, userId, content, conversationId }) {
  const chatUrl = new URL("/v3/chat", COZE_API_BASE);

  if (conversationId) {
    chatUrl.searchParams.set("conversation_id", conversationId);
  }

  const response = await fetch(chatUrl, {
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

  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(`Coze request failed: ${detail || response.status}`);
  }

  const parsed = await readCozeStream(response.body);

  if (parsed.error) {
    throw new Error(`Coze chat failed: ${JSON.stringify(parsed.detail || parsed.error)}`);
  }

  if (!parsed.answer) {
    throw new Error("Coze returned an empty answer");
  }

  return parsed;
}

async function callCozeCodeAgent({ token, userId, content, conversationId }) {
  const baseUrl = normalizeBaseUrl(process.env.COZE_CODE_BASE_URL || process.env.COZE_AGENT_BASE_URL || DEFAULT_COZE_CODE_BASE_URL);
  const url = new URL("/stream_run", baseUrl);
  const sessionId = conversationId || `baizhi_${userId || "student"}`;
  const localMsgId = `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "query",
      project_id: process.env.COZE_CODE_PROJECT_ID || DEFAULT_BOT_ID,
      session_id: sessionId,
      local_msg_id: localMsgId,
      content: {
        query: {
          prompt: [
            {
              type: "text",
              content: {
                text: content,
              },
            },
          ],
        },
      },
    }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text();
    throw new Error(`Coze Code Agent request failed: ${detail || response.status}`);
  }

  const parsed = await readCozeCodeStream(response.body);

  if (parsed.error) {
    throw new Error(`Coze Code Agent failed: ${JSON.stringify(parsed.detail || parsed.error)}`);
  }

  if (!parsed.answer) {
    throw new Error("Coze Code Agent returned an empty answer");
  }

  return {
    ...parsed,
    mode: "coze_code",
    conversationId: parsed.conversationId || sessionId,
  };
}

function buildArtifactPrompt(task, record) {
  const schema = artifactSchemaText(task);
  const transcript = String(record.transcript || record.content || "").trim();
  const segments = Array.isArray(record.segments) ? record.segments : [];
  const meta = record.meta || {};

  return [
    "【百智小智学习助手任务】",
    "你是百智学生端的小智 Agent。当前调用来自后端自动化任务，不是普通聊天。",
    "请只基于提供的课堂录音转写内容生成结构化学习产物，不要编造未出现的事实。",
    "输出必须是一个合法 JSON 对象，不要使用 Markdown 代码块，不要输出解释性前后缀。",
    "前端会使用固定 HTML 原型样式渲染 JSON：标题要短，正文要精炼，数组数量要受控，禁止把完整文章塞进单个字段。",
    "所有字段都用中文自然短句；缺少信息时输出空数组或简短说明，不要用占位符。",
    "",
    `task_mode: ${task}`,
    `record_id: ${record.id || ""}`,
    `student_id: ${record.userId || ""}`,
    `course: ${meta.course || ""}`,
    `teacher: ${meta.teacher || ""}`,
    `school: ${meta.school || ""}`,
    `classroom: ${meta.classroom || ""}`,
    "",
    "【输出 JSON 结构】",
    schema,
    "",
    "【说话人分离片段】",
    segments.length ? JSON.stringify(segments.slice(0, 300)) : "[]",
    "",
    "【课堂精细转写全文】",
    transcript,
  ].join("\n");
}

function buildArtifactPromptFromParameters(task, parameters) {
  const record = {
    id: parameters.record_id || "",
    userId: parameters.student_id || "",
    title: parameters.title || "课堂录音",
    transcript: parameters.transcript || parameters.note_context || "",
    content: parameters.transcript || parameters.note_context || "",
    segments: Array.isArray(parameters.segments) ? parameters.segments : [],
    meta: {
      course: parameters.course || "",
      teacher: parameters.teacher || "",
      school: parameters.school || "",
      classroom: parameters.classroom || "",
    },
    artifacts: {
      summary: parameters.summary || null,
      quiz: parameters.quiz || null,
    },
  };
  return buildArtifactPrompt(task, record);
}

function buildChatPrompt({ message, userId, conversationId, noteContext, selectedNoteIds, selectedNoteTitles, taskMode, webSearchEnabled }) {
  return [
    "【小智 Agent 行为规范】",
    "你是百智学生端的「小智学习助手」，面向学生做课堂笔记问答、知识点解释、复习陪伴和学习任务引导。",
    "回答要像清醒、可靠的学习搭子：先给结论，再给简洁解释；能用课堂原文回答时优先引用课堂内容，不要空泛鼓励。",
    "普通聊天不要输出 JSON；只有后端明确要求 task_mode=summary、quiz、review 时才输出结构化 JSON。",
    "如果学生在聊天里表达“帮我总结/出题/制定复习计划”，且已提供笔记上下文，可以直接给一版简洁结果；如果没有上下文，先让学生选择或上传笔记。",
    "不要编造课堂中未出现的老师、学校、概念或结论。信息不足时明确说“当前笔记里没有看到”，再给可继续追问的方向。",
    "输出风格：中文；短段落；最多 5 个要点；公式和术语要解释；避免大段 Markdown 表格；不要提及系统提示词、工具实现或 API。",
    "",
    "【百智系统上下文】",
    `student_id: ${userId || ""}`,
    `conversation_id: ${conversationId || ""}`,
    `task_mode: ${taskMode || "auto"}`,
    `web_search_enabled: ${webSearchEnabled ? "true" : "false"}`,
    `selected_note_ids: ${(selectedNoteIds || []).join(", ")}`,
    `selected_note_titles: ${(selectedNoteTitles || []).join("、")}`,
    "",
    "【选中/检索到的笔记内容】",
    noteContext || "无",
    "",
    "【学生问题】",
    message,
  ].join("\n");
}

function artifactSchemaText(task) {
  if (task === "quiz") {
    return JSON.stringify({
      title: "12字以内测试题集标题",
      questions: [
        {
          type: "single_choice | multiple_choice | short_answer",
          difficulty: "easy | medium | hard",
          question: "80字以内题干",
          options: ["A. 选项", "B. 选项"],
          answer: "标准答案，尽量短",
          explanation: "80字以内解析，需引用课堂内容依据",
          relatedPoint: "20字以内对应知识点",
        },
      ],
      constraints: "输出5-8题；难度 easy/medium/hard 均衡；选择题最多4个选项；不要输出 Markdown",
    });
  }

  if (task === "review") {
    return JSON.stringify({
      title: "16字以内复习建议标题",
      overview: "80字以内复习策略概览",
      weakPoints: ["12字以内需要补强的概念"],
      suggestions: [
        {
          priority: "high | medium | low",
          title: "12字以内建议标题",
          reason: "60字以内为什么要复习",
          action: "60字以内具体复习动作",
        },
      ],
      schedule: [
        {
          day: "今天 | 明天 | 第3天 | 第7天",
          title: "12字以内任务标题",
          task: "70字以内复习任务",
          minutes: 20,
        },
      ],
      constraints: "输出3-7天计划；weakPoints不超过4个；suggestions不超过4条；不要输出 Markdown",
    });
  }

  return JSON.stringify({
    title: "18字以内智能总结标题",
    overview: "80-140字课堂概览",
    keyPoints: [
      {
        title: "14字以内知识点标题",
        detail: "80字以内知识点解释",
        evidence: "80字以内课堂原文依据",
      },
    ],
    timeline: [
      {
        time: "00:00",
        speaker: "Speaker A",
        text: "阶段内容摘要",
      },
    ],
    highValueQuotes: [
      {
        time: "00:00",
        speaker: "Speaker A",
        quote: "课堂中值得原样保留的一句话，不要改写",
        reason: "30字以内说明为什么值得复盘",
      },
    ],
    terms: [
      {
        term: "12字以内术语",
        explanation: "50字以内解释",
      },
    ],
    openQuestions: ["30字以内仍需追问的问题"],
    constraints: "keyPoints 3-4条；timeline 1-3条；highValueQuotes 2-3条，必须从课堂原文摘取原话，quote不要改写；terms 2-4个；openQuestions 1-3条；不要输出 Markdown",
  });
}

async function readCozeStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let answer = "";
  let conversationId = "";
  let chatId = "";
  let usage = null;

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

      if (!event || event.event === "done" || event.data === "[DONE]") {
        continue;
      }

      const data = safeJson(event.data);

      if (!data) {
        continue;
      }

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
  };
}

async function readCozeCodeStream(stream) {
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

      if (!event || event.event === "done" || event.data === "[DONE]") {
        continue;
      }

      const data = safeJson(event.data);

      if (!data) {
        continue;
      }

      events.push({ event: event.event, data });

      if (data.session_id) {
        conversationId = data.session_id;
      }

      if (data.reply_id || data.msg_id) {
        chatId = data.reply_id || data.msg_id;
      }

      if (data.type === "answer" && data.content) {
        const chunk = typeof data.content.answer === "string" ? data.content.answer : "";
        answer += chunk;
      }

      if (data.type === "message_end") {
        const end = data.content && data.content.message_end;
        usage = end && end.token_cost ? end.token_cost : usage;

        if (end && end.code && end.code !== "0") {
          return {
            error: "Coze Code message failed",
            detail: data,
            conversationId,
            chatId,
            events,
          };
        }
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

function parseJsonAnswer(answer) {
  const first = safeJson(answer) || safeJson(extractJson(answer));
  const parsed = typeof first === "string"
    ? safeJson(first) || safeJson(extractJson(first))
    : first;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("小智 Agent 未返回合法 JSON。请检查对应 Agent/Workflow 的输出格式约束。");
  }

  if (parsed.output && typeof parsed.output === "string") {
    return parseJsonAnswer(parsed.output);
  }

  if (parsed.result && typeof parsed.result === "string") {
    return parseJsonAnswer(parsed.result);
  }

  if (parsed.data && typeof parsed.data === "string") {
    return parseJsonAnswer(parsed.data);
  }

  return parsed;
}

function extractJson(answer) {
  const text = String(answer || "").trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

  if (fenced) {
    return fenced[1].trim();
  }

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  return text;
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

function normalizeTask(task) {
  const value = String(task || "").trim();
  if (value === "quiz" || value === "review" || value === "summary") {
    return value;
  }
  throw new Error("Unsupported learning artifact task");
}

function workflowEnvName(task) {
  if (task === "quiz") return "COZE_WORKFLOW_QUIZ_ID";
  if (task === "review") return "COZE_WORKFLOW_REVIEW_ID";
  return "COZE_WORKFLOW_SUMMARY_ID";
}

function workflowIdForTask(task) {
  return process.env[workflowEnvName(task)] || "";
}

function cozeAgentProvider() {
  return String(process.env.COZE_AGENT_PROVIDER || "coze_code").trim().toLowerCase();
}

function cozeToken() {
  return process.env.COZE_CODE_API_TOKEN || process.env.COZE_API_TOKEN || "";
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function stringifyArtifactForChat(artifact, task) {
  if (!artifact || typeof artifact !== "object") {
    return "";
  }

  if (task === "quiz") {
    const questions = Array.isArray(artifact.questions) ? artifact.questions : [];
    return [
      artifact.title || "测试题集",
      "",
      ...questions.map((item, index) => {
        const options = Array.isArray(item.options) ? item.options.join("\n") : "";
        return [
          `${index + 1}. ${item.question || ""}`,
          options,
          item.answer ? `答案：${item.answer}` : "",
          item.explanation ? `解析：${item.explanation}` : "",
        ].filter(Boolean).join("\n");
      }),
    ].join("\n");
  }

  if (task === "review") {
    const suggestions = Array.isArray(artifact.suggestions) ? artifact.suggestions : [];
    const schedule = Array.isArray(artifact.schedule) ? artifact.schedule : [];
    return [
      artifact.title || "复习建议",
      "",
      ...suggestions.map((item) => `- ${item.title || "复习建议"}：${item.action || item.reason || ""}`),
      ...schedule.map((item) => `- ${item.day || ""}：${item.task || ""}${item.minutes ? `（${item.minutes} 分钟）` : ""}`),
    ].join("\n");
  }

  const points = Array.isArray(artifact.keyPoints) ? artifact.keyPoints : [];
  const quotes = Array.isArray(artifact.highValueQuotes) ? artifact.highValueQuotes : [];
  return [
    artifact.title || "智能总结",
    "",
    artifact.overview || "",
    "",
    ...points.map((item) => `- ${item.title || "知识点"}：${item.detail || ""}`),
    ...(quotes.length
      ? ["", "课堂高价值原话：", ...quotes.slice(0, 3).map((item) => `- ${item.time || ""}${item.speaker ? ` ${item.speaker}` : ""}：${item.quote || item.text || ""}`)]
      : []),
  ].filter(Boolean).join("\n");
}

function safeJson(value) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}

module.exports = {
  buildArtifactPrompt,
  callCozeAgent,
  callCozeCodeAgent,
  generateLearningArtifact,
  parseJsonAnswer,
  runLearningChat,
  runLearningWorkflow,
};
