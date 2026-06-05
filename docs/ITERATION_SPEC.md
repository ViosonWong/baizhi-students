# Baizhi Students Iteration Spec

This spec defines how future changes should be designed, implemented, verified, committed, and shipped.

## 1. Core Principle

All page and interaction work must start from source code.

Use:

```text
src/
public/
api/
realtime-asr/
index.html as the Vite entry only
```

Do not use generated or legacy static HTML as the main development surface.

Avoid directly maintaining:

```text
dist/
dist-singlefile/
baizhi-students-home-v3.html
baizhi-students-home-v3-interaction.html
large bundled code inside index.html
```

## 2. Source Ownership

Typical edit locations:

```text
src/App.tsx                     UI structure and React behavior
src/styles.css                  Primary app styling
src/main.tsx                    App bootstrap and global imports
src/legacy/*                    Temporary migration shims only
public/*                        Static runtime assets
api/*                           Serverless API routes
realtime-asr/*                  Realtime ASR service
vercel.json                     Vercel build/deploy config
netlify.toml                    Netlify build/deploy config
```

`src/legacy/*` is allowed as a bridge, but stable product features should gradually move into React components.

## 3. Demo Mode

Demo work may use mock data and simulated flows.

Allowed demo behavior:

- Fake login
- Fake recording progress
- Fake AI responses
- Fake payment or credits
- Fake transcription and generated notes
- LocalStorage-backed state
- Offline-friendly pure frontend interaction

Demo artifacts must still be generated from source.

Preferred build command:

```bash
npm run build:single
```

Preferred demo output:

```text
dist-singlefile/index.html
```

If a stable shareable demo file is requested, place it under:

```text
demo/
```

Do not manually maintain demo HTML long term.

## 4. Production Mode

Production should use real APIs where available and graceful fallback where not.

Requirements:

- No blank screen if an API fails.
- Mock or demo-only behavior must be identifiable.
- Production deploys should build with Vite.

Current production build command:

```bash
npm run build
```

Current production publish directory:

```text
dist
```

## 5. Request Format

When possible, describe requested work using:

```text
Goal: what should change
Scope: demo / production / both
Data: real API / mock / best-effort hybrid
Delivery: local HTML / deployable source / both
```

Example:

```text
Goal: demonstrate the full flow from start recording to generated AI notes
Scope: demo first, production best effort
Data: mock first, real ASR if available
Delivery: local HTML plus deployable source
```

## 6. Verification

After source or build-related changes, run:

```bash
npm run build
```

When demo output matters, also run:

```bash
npm run build:single
```

For UI changes, run the local app:

```bash
npm run dev
```

Minimum browser checks:

- Home page renders.
- Today Classroom view opens.
- AI Notes view opens.
- XiaoZhi panel mounts where expected.
- Recording entry does not show obvious errors.
- Browser console has no errors.

## 7. Commit Scope

Usually commit:

```text
src/**
public/**
index.html
package.json
package-lock.json
vite.config.ts
tsconfig.json
tsconfig.node.json
vercel.json
netlify.toml
api/**
realtime-asr/**
```

Commit only with explicit intent:

```text
asr-recorder.js
demo/**
legacy static HTML files
```

Do not commit by default:

```text
dist/**
dist-singlefile/**
node_modules/**
temporary screenshots
.playwright-mcp/**
```

## 8. Branch And Merge

Recommended flow:

```bash
git checkout -b codex/feature-name
npm run build
npm run build:single
git status --short
git add <needed files only>
git commit -m "Clear change summary"
git push origin <branch>
```

Before merging to `main`, confirm:

- Build passes.
- Deployment config publishes `dist`.
- No old static HTML changes are mixed in.
- No generated artifacts or temporary files are mixed in.

## 9. One-Line Rule

```text
Source first, build generated; demo may mock, production may fallback; old HTML is not the main development entry.
```

