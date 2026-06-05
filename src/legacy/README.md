# Restored Home V3 Snapshot

This directory contains the source-managed restoration of the last known-good
home page that was previously served as bundled static HTML.

- `home-v3-bundle.js` was extracted from `2e388c3:baizhi-students-home-v3.html`.
- `xiaozhi-overlay-bundle.js` was extracted from the same HTML snapshot.
- `public/asr-recorder.js` was restored from `204e1b9:asr-recorder.js`.

`src/App.tsx` mounts these bundles into the Vite app so the self-hosted deploy
can publish `dist/` again. Future UI work should gradually replace this legacy
bundle with typed React components instead of editing the minified bundle by
hand.
