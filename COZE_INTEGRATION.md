# 小智 Agent 接入说明

本仓库已经加入一个最小可落地的扣子 API 代理层，用来把百智学生端的真实笔记上下文传给已发布的小智 Agent。

## 已接入内容

- `api/coze-chat.js`：服务端代理，调用扣子 `ChatV3` 接口。
- `api/coze-conversations.js`：查询 API 渠道下的扣子会话，主要用于调试。
- `coze-agent-test.html`：部署后访问 `/coze-agent-test.html` 可验证 Agent 是否能返回真实结果。
- `.env.example`：环境变量模板。

## 环境变量

当前仓库的 `api/*.js` 是 Vercel Serverless Functions 形态。上线到 Vercel 时，在项目环境变量里配置：

```bash
COZE_API_TOKEN=你的扣子访问令牌
COZE_BOT_ID=7645702499248816168
COZE_API_BASE=https://api.coze.cn
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
