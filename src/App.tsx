import { useEffect } from "react";
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

export default function App() {
  useEffect(() => {
    mountLegacyHome();
  }, []);

  return <div id={LEGACY_ROOT_ID} />;
}
