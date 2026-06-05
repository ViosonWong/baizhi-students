# Project Iteration Rules

Before making any UI, demo, deployment, or build-related change in this repo, read and follow:

- `docs/ITERATION_SPEC.md`

Non-negotiable defaults:

- Treat `src/` as the main development surface.
- Treat `public/` as static source assets.
- Treat `index.html` as the Vite entry only.
- Do not hand-edit generated bundles or old static HTML pages for main UI work.
- Do not commit `dist/`, `dist-singlefile/`, temporary screenshots, or legacy static HTML changes unless explicitly requested.
- Run `npm run build` after source or deployment changes.
- Run `npm run build:single` when producing or validating a demo artifact.

