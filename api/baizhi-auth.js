const crypto = require("crypto");

const SIGN_SALT = "BAIZHIAPPLICATION";
const DEFAULT_BAIZHI_BASE_URL = "https://baizhi.100credit.com";
const DEFAULT_REDIRECT_URL = "http://127.0.0.1:5173/open";
const SESSION_COOKIE_NAME = "baizhi_login_token";

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const action = normalizeText(req.query.action);

  try {
    if (req.method === "GET" && action === "authorize") {
      const authorizeUrl = buildAuthorizeUrl();
      res.status(200).json({ authorizeUrl });
      return;
    }

    if (req.method === "POST" && action === "exchange") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const temporaryToken = normalizeText(body.token);

      if (!temporaryToken) {
        res.status(400).json({ error: "token is required" });
        return;
      }

      const token = await exchangeTemporaryToken(temporaryToken);
      setSessionCookie(res, token);
      res.status(200).json({ ok: true, token });
      return;
    }

    if (req.method === "POST" && action === "logout") {
      clearSessionCookie(res);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(404).json({ error: "Unknown Baizhi auth action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      error: "Baizhi auth request failed",
      detail: message,
    });
  }
};

function buildAuthorizeUrl() {
  const config = getConfig();
  const nonce = crypto.randomBytes(16).toString("hex");
  const sign = crypto
    .createHash("sha256")
    .update(`${config.appId}${config.appSecret}${SIGN_SALT}${nonce}`, "utf8")
    .digest("hex");
  const params = new URLSearchParams({
    app_id: config.appId,
    nonce,
    sign,
    app_name: config.appName,
  });

  return `${config.baseUrl}/oauth-bridge?${params.toString()}`;
}

async function exchangeTemporaryToken(temporaryToken) {
  const config = getConfig();
  const response = await fetch(`${config.baseUrl}/open-api/api/applications/token/exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token: temporaryToken }),
  });
  const raw = await response.text();
  const payload = safeJson(raw);

  if (!response.ok) {
    throw new Error(`Token exchange failed with status ${response.status}: ${raw}`);
  }

  const token = normalizeText(payload && payload.data && payload.data.token);
  if (!token) {
    throw new Error(`Token exchange response missing data.token: ${raw}`);
  }

  return token;
}

function getConfig() {
  const baseUrl = normalizeBaseUrl(process.env.BAIZHI_BASE_URL || DEFAULT_BAIZHI_BASE_URL);
  const appId = normalizeText(process.env.BAIZHI_APP_ID);
  const appSecret = normalizeText(process.env.BAIZHI_APP_SECRET);
  const appName = normalizeText(process.env.BAIZHI_APP_NAME) || "百智学生版";
  const redirectUrl = normalizeText(process.env.BAIZHI_REDIRECT_URL) || DEFAULT_REDIRECT_URL;

  if (!appId) {
    throw new Error("Missing BAIZHI_APP_ID");
  }

  if (!appSecret) {
    throw new Error("Missing BAIZHI_APP_SECRET");
  }

  return {
    baseUrl,
    appId,
    appSecret,
    appName,
    redirectUrl,
  };
}

function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
  );
}

function normalizeBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, "");
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
