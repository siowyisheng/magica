# Magica — agent instructions

## Standard workflow (always do this)

1. Make the change.
2. Verify: `npm run build` (typecheck + build) and `npm test` must both pass.
3. Commit with a clear message and **push to `origin` (https://github.com/siowyisheng/magica.git) when the work is done**. The user does not need to ask for this each time. It is the default for this project.
   - Small, self-contained work → commit directly to `main` and push.
   - Large or risky changes → push a feature branch and open a PR instead.
   - Never force-push `main`.

## Project rules

- `src/game/` must stay pure and deterministic: no React, no DOM, no `Date.now()`, no `Math.random()` (use `rng.ts` with a seed). Replays and spectating depend on this.
- Every game rule change goes through `applyAction` in `engine.ts`, and the AI-vs-AI replay test must keep passing.
- New abilities, archetypes and relics go in `content.ts`. New effect types need handling in both `engine.ts` (`resolveEffect`) and `ai.ts` (`scoreCast`).
- Keep `vite.config.ts` `base: './'` so the build stays loadable from `file://` for Windows packaging (Electron/Tauri).
