import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import crypto from "node:crypto";

const SIGN_SALT = "BAIZHIAPPLICATION";
const DEFAULT_BAIZHI_BASE_URL = "https://baizhi.100credit.com";
const DEFAULT_REDIRECT_URL = "http://127.0.0.1:5173/open";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins:
      mode === "singlefile"
        ? [react(), baizhiAuthDevApi(env), viteSingleFile()]
        : [react(), baizhiAuthDevApi(env)],
    base: "./",
    build: {
      outDir: mode === "singlefile" ? "dist-singlefile" : "dist",
      emptyOutDir: true,
    },
  };
});

function baizhiAuthDevApi(env: Record<string, string>) {
  return {
    name: "baizhi-auth-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/baizhi-auth", async (req, res) => {
        const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
        const action = requestUrl.searchParams.get("action") || "";

        try {
          if (req.method === "GET" && action === "authorize") {
            json(res, 200, { authorizeUrl: buildAuthorizeUrl(env) });
            return;
          }

          if (req.method === "POST" && action === "exchange") {
            const body = await readJsonBody(req);
            const temporaryToken = normalizeText(body.token);

            if (!temporaryToken) {
              json(res, 400, { error: "token is required" });
              return;
            }

            const token = await exchangeTemporaryToken(temporaryToken, env);
            res.setHeader(
              "Set-Cookie",
              `baizhi_login_token=${encodeURIComponent(token)}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax`,
            );
            json(res, 200, { ok: true, token });
            return;
          }

          if (req.method === "POST" && action === "logout") {
            res.setHeader("Set-Cookie", "baizhi_login_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
            json(res, 200, { ok: true });
            return;
          }

          json(res, 404, { error: "Unknown Baizhi auth action" });
        } catch (error) {
          json(res, 500, {
            error: "Baizhi auth request failed",
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      });
    },
  };
}

function buildAuthorizeUrl(env: Record<string, string>) {
  const config = getConfig(env);
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

async function exchangeTemporaryToken(temporaryToken: string, env: Record<string, string>) {
  const config = getConfig(env);
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

  const token = normalizeText(payload?.data?.token);
  if (!token) {
    throw new Error(`Token exchange response missing data.token: ${raw}`);
  }

  return token;
}

function getConfig(env: Record<string, string>) {
  const baseUrl = normalizeBaseUrl(env.BAIZHI_BASE_URL || DEFAULT_BAIZHI_BASE_URL);
  const appId = normalizeText(env.BAIZHI_APP_ID);
  const appSecret = normalizeText(env.BAIZHI_APP_SECRET);
  const appName = normalizeText(env.BAIZHI_APP_NAME) || "百智学生版";
  const redirectUrl = normalizeText(env.BAIZHI_REDIRECT_URL) || DEFAULT_REDIRECT_URL;

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

function readJsonBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("error", reject);
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function json(res: import("node:http").ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function normalizeBaseUrl(value: string) {
  return normalizeText(value).replace(/\/+$/, "");
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
