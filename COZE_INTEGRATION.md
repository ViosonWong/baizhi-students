# 小智 Agent 接入说明

本仓库已经加入一个可落地的扣子 API 代理层，用来把百智学生端的真实笔记上下文传给已发布的小智 Agent，并把「智能总结 / 测试题集 / 复习建议」拆成三个稳定的扣子 Workflow/API。

## 已接入内容

- `api/coze-chat.js`：服务端代理。普通聊天调用扣子 `ChatV3`；当 `taskMode=summary|quiz|review` 时改走对应扣子 Workflow。
- `api/coze-conversations.js`：查询 API 渠道下的扣子会话，主要用于调试。
- `api/class-audio-tasks.js`：课堂音频任务接口，用户点击后触发三条扣子 Workflow 生成智能总结、测试题集、复习建议，并把结构化产物写回课堂音频记录。
- `realtime-asr/coze-agent.js`：小智 Agent 的任务提示词与 JSON 输出约束。
- `coze-agent-test.html`：部署后访问 `/coze-agent-test.html` 可验证 Agent 是否能返回真实结果。
- `.env.example`：环境变量模板。

## 百智小智学习助手调优设定

扣子后台里的 Agent 建议保持一个统一身份：「百智小智学习助手」。后端会在每次调用时传入 `task_mode` 区分交付形态：

- `summary`：输出智能总结 JSON，包含 `overview`、`keyPoints`、`timeline`、`terms`、`openQuestions`。
- `quiz`：输出测试题集 JSON，包含题型、难度、题干、选项、答案、解析和关联知识点。
- `review`：输出复习建议 JSON，包含薄弱点、建议优先级、行动建议和复习计划。
- `auto`：保留给右侧小智聊天，不强制 JSON，适合学生追问。

Agent 提示词核心约束：

```text
你是百智学生端的小智 Agent。普通聊天时像学习搭子一样解释问题；当收到 task_mode=summary、quiz、review 时，这是后端结构化任务调用，必须只基于提供的课堂转写和说话人片段输出合法 JSON，不要 Markdown 代码块，不要编造课堂外事实。
```

## 推荐实现方案

不要只依赖一个自由聊天 Agent 根据提示词自行判断要不要调用技能。为了保证线上按钮、输出结构和交付形态稳定，当前代码已经按「一个小智 Agent 入口 + 三个固定 Workflow/API」落地：

- `summary`：配置 `COZE_WORKFLOW_SUMMARY_ID`，输入课堂转写、说话人片段、课程信息，输出智能总结 JSON。
- `quiz`：配置 `COZE_WORKFLOW_QUIZ_ID`，输入同一份课堂上下文，输出测试题集 JSON。
- `review`：配置 `COZE_WORKFLOW_REVIEW_ID`，输入课堂上下文和已生成总结/题集，输出复习建议 JSON。
- `auto`：保留给右侧小智聊天，继续调用同一个小智 Agent 的 ChatV3。

百智后端仍统一调用小智能力，但必须明确传入任务模式，并把结果写回自己的数据库：

```text
前端按钮 -> /api/class-audio-tasks -> 百智后端读取录音记录
-> 调用小智 Agent 对应 Skill/Workflow
-> 校验 JSON schema
-> 写回 class_audio_records.artifacts
-> 前端按线上 UI 样式渲染
```

右侧小智聊天也覆盖这三类场景：聊天请求如果携带 `taskMode=summary|quiz|review`，`/api/coze-chat` 会复用同一份课堂上下文并调用对应 Workflow；没有 `taskMode` 时才走普通小智 Agent 对话。这样前端交互和输出排版都由百智控制，扣子只负责生成结构化内容。

## 环境变量

当前仓库的 `api/*.js` 是 Vercel Serverless Functions 形态。上线到 Vercel 时，在项目环境变量里配置：

```bash
COZE_API_TOKEN=你的扣子访问令牌
COZE_BOT_ID=7645702499248816168
COZE_API_BASE=https://api.coze.cn
COZE_WORKFLOW_SUMMARY_ID=智能总结WorkflowID
COZE_WORKFLOW_QUIZ_ID=测试题集WorkflowID
COZE_WORKFLOW_REVIEW_ID=复习建议WorkflowID
COZE_WORKFLOW_PARAMETERS_FORMAT=string
ALLOWED_ORIGIN=https://www.100waytoai.com
```

不要把 `COZE_API_TOKEN` 写进前端代码、HTML、Git 仓库或浏览器 LocalStorage。

## 前端调用

聊天框发送消息时，请改为请求：

```js
const response = await fetch("/api/coze-chat", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    studentId: currentUser.id,
    conversationId: activeConversation?.cozeConversationId,
    message: inputText,
    selectedNoteIds: selectedNotes.map((note) => note.id),
    selectedNoteTitles: selectedNotes.map((note) => note.title),
    noteContext: retrievedNoteChunks
      .map((chunk) => `【${chunk.noteTitle}】\n${chunk.content}`)
      .join("\n\n"),
    webSearchEnabled,
    taskMode,
  }),
});

const data = await response.json();
```

返回结构：

```json
{
  "answer": "小智的回复",
  "conversationId": "扣子会话 ID",
  "chatId": "扣子本轮 Chat ID",
  "usage": {
    "token_count": 1000
  }
}
```

第一次对话没有 `conversationId` 时可以不传。接口会返回新的 `conversationId`，前端或后端需要保存到你的会话表，用于后续多轮对话。

## 笔记选择与 RAG 流程

小智 Agent 不直接读取百智数据库。建议流程如下：

1. 学生在聊天框中勾选「课堂笔记」或「我的笔记」。
2. 前端把 `selectedNoteIds` 发给百智后端。
3. 百智后端按笔记 ID 和用户问题检索相关片段。
4. 把片段拼成 `noteContext` 发给 `/api/coze-chat`。
5. 小智优先基于 `noteContext` 回答；联网搜索只作为补充。

## 历史对话

产品侧历史会话建议仍保存在百智自己的数据库：

```sql
conversations(id, student_id, title, coze_conversation_id, created_at, updated_at)
messages(id, conversation_id, role, content, selected_note_ids, task_mode, created_at)
```

每次 `/api/coze-chat` 返回后：

1. 保存学生消息。
2. 保存小智回复。
3. 首轮对话保存 `cozeConversationId`。
4. 新建对话时创建新的百智 `conversation`，不要传旧的 `conversationId` 给扣子。

如果部署到 Netlify 或传统服务器，需要把同样逻辑迁移到 Netlify Functions、Node 服务或现有后端服务中。

## 本地/部署验证

部署到 Vercel 后：

1. 在项目环境变量中配置 `COZE_API_TOKEN`、`COZE_BOT_ID`。
2. 访问 `/coze-agent-test.html`。
3. 输入一段笔记，点击发送。
4. 能看到小智真实回复即说明 API 链路成功。
