import { useEffect, useState } from "react";
import {
  clearBaizhiSession,
  exchangeBaizhiTemporaryToken,
  redirectToBaizhiAuthorize,
} from "./baizhiAuth";
import legacyHomeBundle from "./legacy/home-v3-bundle.js?raw";
import xiaozhiOverlayBundle from "./legacy/xiaozhi-overlay-bundle.js?raw";

declare global {
  interface Window {
    __baizhiLegacyHomeMounted?: boolean;
  }
}

const LEGACY_ROOT_ID = "legacy-root";

function mountLegacyHome() {
  if (window.__baizhiLegacyHomeMounted) return;
  window.__baizhiLegacyHomeMounted = true;

  const legacyScript = document.createElement("script");
  legacyScript.type = "module";
  legacyScript.textContent = legacyHomeBundle.replace(
    'document.getElementById("root")',
    `document.getElementById("${LEGACY_ROOT_ID}")`,
  );
  document.body.appendChild(legacyScript);

  const overlayScript = document.createElement("script");
  overlayScript.textContent = xiaozhiOverlayBundle;
  document.body.appendChild(overlayScript);

  const recorderScript = document.createElement("script");
  recorderScript.src = "/asr-recorder.js";
  document.body.appendChild(recorderScript);
}

function BaizhiCallbackPage() {
  const [message, setMessage] = useState("正在完成百智登录...");

  useEffect(() => {
    const temporaryToken = new URLSearchParams(window.location.search).get("token");

    if (!temporaryToken) {
      setMessage("授权失败：回调地址缺少临时 token");
      return;
    }

    let cancelled = false;

    exchangeBaizhiTemporaryToken(temporaryToken)
      .then(() => {
        if (cancelled) return;
        window.history.replaceState(null, "", "/");
        window.location.replace("/");
      })
      .catch((error) => {
        if (cancelled) return;
        const detail = error instanceof Error ? error.message : String(error);
        window.history.replaceState(null, "", "/open");
        setMessage(`授权失败：${detail}`);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="baizhi-callback-page">
      <section className="baizhi-callback-card">
        <span className="baizhi-callback-mark">百</span>
        <h1>{message}</h1>
        <p>请保持当前窗口打开，百智学生版正在同步你的登录态。</p>
      </section>
    </main>
  );
}

function BaizhiLoginBridge() {
  useEffect(() => {
    const cleanupLoginButton = () => {
      const form = document.querySelector(".login-form-side");
      const existing = form?.querySelector(".baizhi-oauth-button");

      if (!form || existing) {
        return;
      }

      const submitButton = form.querySelector(".login-submit");
      const divider = document.createElement("div");
      divider.className = "baizhi-oauth-divider";
      divider.textContent = "或";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "baizhi-oauth-button";
      button.textContent = "使用百智账号授权登录";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();

        button.disabled = true;
        button.textContent = "正在打开百智授权...";

        try {
          await redirectToBaizhiAuthorize();
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          button.disabled = false;
          button.textContent = detail;
        }
      });

      if (submitButton) {
        submitButton.insertAdjacentElement("afterend", divider);
        divider.insertAdjacentElement("afterend", button);
      } else {
        form.append(divider, button);
      }
    };

    cleanupLoginButton();

    const observer = new MutationObserver(cleanupLoginButton);
    observer.observe(document.body, { childList: true, subtree: true });

    const logoutListener = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest(".account-dropdown-item.logout")) {
        void clearBaizhiSession();
      }
    };
    document.addEventListener("click", logoutListener);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", logoutListener);
    };
  }, []);

  return null;
}

export default function App() {
  const isBaizhiCallback = window.location.pathname === "/open";

  useEffect(() => {
    if (isBaizhiCallback) return;
    mountLegacyHome();
  }, [isBaizhiCallback]);

  if (isBaizhiCallback) {
    return <BaizhiCallbackPage />;
  }

  return (
    <>
      <div id={LEGACY_ROOT_ID} />
      <BaizhiLoginBridge />
    </>
  );
}
