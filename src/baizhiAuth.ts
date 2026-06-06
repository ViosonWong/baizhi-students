const AUTH_API_PATH = "/api/baizhi-auth";
const LOGIN_MARK_STORAGE_KEY = "baizhi-students.mock-login";
const TOKEN_STORAGE_KEY = "baizhi-students.baizhi-token";

type AuthorizeResponse = {
  authorizeUrl?: string;
  error?: string;
  detail?: string;
};

type ExchangeResponse = {
  ok?: boolean;
  token?: string;
  error?: string;
  detail?: string;
};

export async function redirectToBaizhiAuthorize() {
  const response = await fetch(`${AUTH_API_PATH}?action=authorize`, {
    method: "GET",
    credentials: "include",
  });
  const payload = (await response.json().catch(() => ({}))) as AuthorizeResponse;

  if (!response.ok || !payload.authorizeUrl) {
    throw new Error(payload.detail || payload.error || "无法生成百智授权地址");
  }

  window.location.assign(payload.authorizeUrl);
}

export async function exchangeBaizhiTemporaryToken(temporaryToken: string) {
  const response = await fetch(`${AUTH_API_PATH}?action=exchange`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token: temporaryToken }),
  });
  const payload = (await response.json().catch(() => ({}))) as ExchangeResponse;

  if (!response.ok || !payload.token) {
    throw new Error(payload.detail || payload.error || "百智授权换取登录态失败");
  }

  saveBaizhiSession(payload.token);
  return payload.token;
}

export async function clearBaizhiSession() {
  forgetBaizhiSession();

  await fetch(`${AUTH_API_PATH}?action=logout`, {
    method: "POST",
    credentials: "include",
  }).catch(() => undefined);
}

export function saveBaizhiSession(token: string) {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem(LOGIN_MARK_STORAGE_KEY, "true");
}

export function forgetBaizhiSession() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(LOGIN_MARK_STORAGE_KEY);
}

export function getStoredBaizhiToken() {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY) || "";
}

export function baizhiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const token = getStoredBaizhiToken();
  const headers = new Headers(init.headers);

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? "include",
  });
}
