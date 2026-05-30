const COZE_API_BASE = process.env.COZE_API_BASE || "https://api.coze.cn";
const DEFAULT_BOT_ID = "7645702499248816168";

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.COZE_API_TOKEN;
  const botId = process.env.COZE_BOT_ID || DEFAULT_BOT_ID;

  if (!token) {
    res.status(500).json({ error: "Missing COZE_API_TOKEN" });
    return;
  }

  const url = new URL("/v1/conversations", COZE_API_BASE);
  url.searchParams.set("bot_id", botId);
  url.searchParams.set("page_num", req.query.page_num || "1");
  url.searchParams.set("page_size", req.query.page_size || "20");
  url.searchParams.set("connector_id", req.query.connector_id || "1024");

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const text = await response.text();
    const payload = safeJson(text) || { raw: text };

    res.status(response.status).json(payload);
  } catch (error) {
    res.status(500).json({
      error: "Unexpected server error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
};

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", process.env.ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
