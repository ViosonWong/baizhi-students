# Baizhi Students UI And Frontend Component Spec

This document captures the current product UI language and frontend rules for
future iterations. It should be read before changing page structure, styles,
components, or interaction flows.

## 1. Product Positioning

The product is an AI learning workspace for students. The UI should feel like a
quiet, capable study console rather than a marketing site.

Design keywords:

- Calm productivity
- Student-friendly but not childish
- AI assistant as a helpful companion
- Learning assets, notes, recordings, and marketplace as first-class objects
- Light, clean, scan-friendly interface

Avoid:

- Landing-page hero layouts for core app pages
- Heavy gradients, decorative blobs, or generic SaaS card walls
- Overly colorful gamification
- Dense enterprise tables unless the workflow truly requires them
- Editing legacy static HTML as the main UI source

## 2. Current Information Architecture

Primary navigation:

```text
首页
今日课堂
AI 笔记
知识广场
```

Current view roles:

- `首页`: product dashboard and learning-method entry. Shows value proposition,
  pain cards, learning methods, and a recording entry.
- `今日课堂`: class recording entry. Focused empty state with mascot, audio waves,
  and a large start-recording action.
- `AI 笔记`: knowledge asset workspace. Left side is note/record list, center is
  note detail and transcript, right side mounts XiaoZhi.
- `知识广场`: marketplace shelf. Filter row plus compact purchasable note cards.

Navigation rule:

- Keep the left rail stable across all views.
- Only show the right XiaoZhi panel when the current workflow benefits from
  contextual note/chat assistance. The current AI Notes view uses it.
- Do not introduce a separate landing page before the actual app.

## 3. Layout System

The shell is a fixed-height app workspace:

```css
.student-app {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) clamp(280px, 22vw, 360px);
  grid-template-areas:
    "nav topbar topbar"
    "nav main agent";
}
```

When XiaoZhi is absent:

```css
.student-app.no-agent {
  grid-template-columns: 88px minmax(0, 1fr);
  grid-template-areas:
    "nav topbar"
    "nav main";
}
```

Layout constraints:

- Page height is `100dvh`; main scrolling happens inside `.main-stage`.
- Body currently assumes desktop width with `min-width: 1180px`.
- Left rail width is `88px`; nav buttons are `64px` wide.
- Topbar height is compact, roughly `48px`.
- Main stage uses transparent/full-width layouts, not nested page cards.
- Cards are individual objects or tools; do not put cards inside cards.

Responsive rule:

- Before mobile work, define a deliberate mobile shell. Do not let the current
  desktop grid collapse accidentally.
- If mobile support is requested, introduce explicit breakpoints and verify the
  four primary views.

## 4. Design Tokens

Use CSS variables from `src/styles.css`. Do not hard-code new one-off colors or
spacing unless there is a strong reason.

Core colors:

```css
--ink: #0f1110;
--ink-2: #1c1f1d;
--muted: #6b716c;
--hint: #9aa09b;
--canvas: #ffffff;
--surface: #ffffff;
--surface-2: #f5f5f5;
--tint: #eeeeee;
--accent: #d9ff45;
--accent-2: #c6f135;
--success: #1f8a5b;
--info: #2f7b52;
--warn: #628a1f;
```

Line colors:

```css
--line: rgba(15, 17, 16, .08);
--line-soft: rgba(15, 17, 16, .05);
--line-hair: rgba(15, 17, 16, .035);
--line-strong: rgba(15, 17, 16, .18);
```

Spacing scale:

```css
--s-1: 4px;
--s-2: 8px;
--s-3: 12px;
--s-4: 16px;
--s-5: 20px;
--s-6: 24px;
--s-7: 32px;
--s-8: 40px;
--s-9: 56px;
--s-10: 72px;
```

Radius scale:

```css
--r-xs: 10px;
--r-sm: 14px;
--r-md: 18px;
--r-lg: 22px;
--r-xl: 28px;
--r-2xl: 36px;
--r-pill: 999px;
```

Motion:

```css
--ease: cubic-bezier(.22, .61, .36, 1);
--ease-out: cubic-bezier(.16, 1, .3, 1);
--t-fast: .14s;
--t-base: .22s;
--t-slow: .36s;
```

Token rules:

- `--accent` is the only strong highlight color. Use it for active nav,
  recording affordances, focus accents, and selected states.
- Keep backgrounds mostly `#f5f5f5`, `--surface`, and `--tint`.
- Use black/ink buttons sparingly for primary irreversible or high-value actions.
- Do not create a second saturated theme color without updating this spec.

## 5. Typography

Font stack:

```css
Inter, PingFang SC, HarmonyOS Sans SC, Hiragino Sans GB,
Microsoft YaHei, -apple-system, BlinkMacSystemFont, sans-serif
```

Global text:

- Base size: `14px`
- Base line-height: `1.55`
- Main text color: `--ink`
- Secondary text: `--muted`
- Hint text: `--hint`

Type hierarchy:

- App/topbar title: about `28px`, strong weight, tight line-height.
- Hero display line: large, expressive, only on the home dashboard.
- Section headers: compact, usually paired with a small description.
- Card titles: `13px` to `18px`, depending on card size.
- Labels/meta: `10px` to `12px`, often bold or uppercase.

Typography rules:

- Do not use viewport-width scaled text.
- Keep letter spacing at `0` or slightly positive for labels. Avoid aggressive
  negative tracking in compact controls.
- Chinese UI copy should be short and action-oriented.
- Use friendly learning language, but keep system/status messages precise.

## 6. Core Components

### App Shell

Source pattern:

```text
.student-app
.thin-nav
.student-topbar
.main-stage
.xiaozhi-panel
```

Rules:

- New views must mount inside `.main-stage`.
- Long content scrolls inside `.main-stage`, not the body.
- Keep `.student-topbar` quiet and compact. It should show context and account
  actions, not become a command center.

### Left Navigation

Source pattern:

```text
.side-nav-button
.side-nav-button.active
.nav-foot-btn
```

Rules:

- Use icon plus short Chinese label.
- Active state is ink background with accent foreground.
- Nav labels should stay two to four Chinese characters where possible.
- Do not add secondary navigation into the left rail unless it applies globally.

### Buttons

Use these semantic classes:

```text
.primary-action
.line-button
.secondary-action
.round-action
```

Rules:

- `.primary-action`: black filled, strongest command.
- `.line-button` / `.secondary-action`: bordered neutral actions.
- `.round-action`: icon-only or compact tool controls.
- Buttons should include icons when the action is tool-like.
- Do not invent ad hoc pill buttons; extend these classes or extract a component.

### Cards

Current card families:

```text
.glass-card
.recorder-card
.file-list-card
.note-detail-card
.market-list-card
.pain-card
.method-poster
.book-card
```

Rules:

- Cards represent a single object, panel, modal, or tool.
- Avoid nested cards. If hierarchy is needed, use dividers, bands, or sections.
- Keep borders subtle: `--line`, `--line-soft`, or `--line-hair`.
- Use hover lift only when the card is clickable.

### Recording Entry

Current classes:

```text
.recorder-card
.record-empty
.record-mascot
.record-wave-disc
.record-start-pill
.rsp-wave
```

Rules:

- Recording CTA should be visually dominant in `今日课堂`.
- Audio/wave animation is acceptable because it communicates listening.
- Recording states must be explicit: idle, recording, paused, metadata,
  generating, done.
- If real ASR fails, show a fallback state instead of blank UI.

### AI Notes Workspace

Current classes:

```text
.notes-grid
.file-list-card
.file-list
.bz-audio-record-card
.note-detail-card
.note-tabs
.note-content-scroll
.speaker-list
.audio-player
```

Rules:

- Left side lists note assets and recordings.
- Center shows the selected asset detail.
- Right XiaoZhi panel is contextual.
- Tabs should stay stable: 转译文本, 智能总结, 测试题集, 复习建议.
- Transcript rows need timestamps and speaker labels.
- Empty, loading, and failed states are required for API-backed records.

### XiaoZhi Panel

Current classes:

```text
.xiaozhi-panel
.agent-chat-card
.agent-chat-head
.agent-welcome
.agent-input
.xz-stream
.xz-textarea
.xz-send-btn
```

Rules:

- XiaoZhi should feel embedded, not like a floating marketing chatbot.
- Keep the panel narrow and task-focused.
- Quick prompts should be short and tied to the selected note.
- Streaming/loading states should be visible and non-blocking.
- The panel should survive API failure with a friendly error and retry path.

### Marketplace

Current classes:

```text
.market-grid
.filter-row
.market-search
.market-list
.book-card
.book-spine-strip
.book-tags
.book-price
```

Rules:

- Marketplace cards are compact book-like objects.
- Preserve the shelf/book metaphor for learning assets.
- Always show school, major/course context, title, tags, author, and price.
- Purchase CTA should be clear but not visually louder than the learning content.

### Modals

Current classes:

```text
.modal-backdrop
.compact-modal
.method-modal
.login-modal
.publish-section
.recharge-grid
```

Rules:

- Modals are for focused tasks: login, purchase, recharge, publish, learning
  method details.
- Use a visible close button.
- Keep form groups visually separated with section titles.
- Do not use modals for ordinary navigation.

## 7. Interaction And Motion

Current motion language:

- Stage entrance: fade + small upward translate.
- Hover: subtle lift, border darkening, light shadow.
- Active nav: immediate visual contrast.
- Recording/audio: wave and pulse motion.
- Pain cards: flip/hover interaction.
- Book cards: hover lift and reveal details.

Rules:

- Motion should explain state or affordance.
- Avoid long decorative animations on workflow screens.
- Keep durations near `--t-fast`, `--t-base`, or `--t-slow`.
- Respect layout stability. Hover should not cause neighboring text to overlap.

## 8. Frontend Architecture Rules

Current bridge state:

```text
src/App.tsx
src/styles.css
src/legacy/home-v3-bundle.js
src/legacy/xiaozhi-overlay-bundle.js
public/asr-recorder.js
```

The current known-good UI is source-managed through a legacy bundle bridge.
Future implementation should gradually extract stable React components from the
legacy bundle.

Target component structure:

```text
src/components/shell/AppShell.tsx
src/components/shell/SideNav.tsx
src/components/shell/Topbar.tsx
src/components/ui/Button.tsx
src/components/ui/Card.tsx
src/components/ui/Modal.tsx
src/components/recording/RecordingPanel.tsx
src/components/notes/NotesWorkspace.tsx
src/components/notes/TranscriptView.tsx
src/components/xiaozhi/XiaoZhiPanel.tsx
src/components/market/Marketplace.tsx
src/components/market/BookCard.tsx
src/views/HomeView.tsx
src/views/ClassroomView.tsx
src/views/NotesView.tsx
src/views/MarketView.tsx
```

Extraction rules:

- Extract one view or component family at a time.
- Keep visual parity with the current online page before changing behavior.
- Do not edit `src/legacy/home-v3-bundle.js` by hand for new product work.
- New behavior belongs in typed React components.
- If a legacy behavior must remain temporarily, wrap it with a clearly named
  adapter and document the removal path.

State and data rules:

- API-backed state must support loading, empty, success, and failed states.
- Demo-only data must be visibly separated in code and copy.
- For audio records, preserve current backend endpoints:
  `/api/class-audio-records`, `/api/class-audio-tasks`, `/api/asr/realtime`,
  `/api/asr`.
- Do not block the full UI because one backend route fails.

## 9. Naming Rules

Preferred class naming:

```text
block
block__element
block--modifier
is-state
```

Current code uses a mix of legacy names. When extracting components:

- Keep existing class names for visual parity.
- Add new classes only when needed.
- Use semantic names: `notes-grid`, `record-start-pill`, `market-list`.
- Avoid names based only on color, position, or temporary experiments.

TypeScript rules:

- Define prop types near components unless shared across multiple files.
- Prefer discriminated unions for UI states.
- Keep mock/demo constants separate from API adapters.
- Use existing `lucide-react` icons for tool buttons and nav items.

## 10. Copywriting Rules

Tone:

- Friendly, clear, student-oriented.
- XiaoZhi can be warmer than system UI.
- Status and error copy must be concrete.

Good patterns:

```text
开始录音
发布到知识广场
转译文本
智能总结
测试题集
复习建议
余额不足，先充点积分吧
```

Avoid:

- Explaining the product inside the app with long instructional paragraphs.
- Calling mock payments or mock login real.
- Overusing exclamation marks.
- Mixing too many metaphors in one view.

## 11. Verification Checklist

For every UI iteration:

```bash
npm run build
```

If a demo artifact is needed:

```bash
npm run build:single
```

Minimum browser verification:

- 首页 renders and primary CTA is visible.
- 今日课堂 opens and recording entry is visible.
- AI 笔记 opens, record list/detail area renders, XiaoZhi panel mounts.
- 知识广场 opens and marketplace cards render.
- `/asr-recorder.js` loads when recording features are touched.
- Console has no blocking errors.

Before commit:

- Do not stage old static HTML changes unless explicitly requested.
- Do not stage `dist/` or `dist-singlefile/`.
- Do not mix source migration with unrelated product changes.

## 12. One-Line Rule

```text
Preserve the calm learning-workspace language; extract legacy UI into typed React gradually; ship only Vite-built source outputs.
```
