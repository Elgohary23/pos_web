# AGENTS.md

## Overview
POS (cashier) system. Two **independent npm packages** — no root `package.json`, no workspace tooling:
- `client/` — React 19 + Vite 8 + react-router-dom 7, **plain JSX (no TypeScript)**. Entry: `client/src/main.jsx` → `App.jsx`.
- `server/` — Express 5, ESM (`"type": "module"`), SQLite via `better-sqlite3`. Entry: `server/index.js`.

## Commands (run inside each package folder — there is no root script)
- Client: `npm run dev` (Vite :5173), `npm run build`, `npm run preview`.
- Server: `npm run dev` (uses `node --watch index.js`) or `npm start` (:3000).
- **No lint/test/typecheck configs exist yet.** They are mandatory per repo DoD, so scaffold one (ESLint, Vitest) when a feature warrants it — never assume a script exists.
- Windows gotcha: when spawning npm programmatically from PowerShell use `npm.cmd`, not `npm` (`Start-Process npm` fails). Repo root path contains Arabic characters — always `-LiteralPath` + quoted paths.

## Dev wiring / conventions
- Vite proxies `/api/*` → `http://localhost:3000` (`client/vite.config.js`). Client calls relative `/api/...` with `credentials: 'include'` (see `client/src/api.js`).
- UI strings and UX are Arabic, RTL (`index.html` has `dir="rtl"`). Keep it that way.

## Auth (already built — extend, don't reinvent)
- Sessions: `express-session` + `connect-sqlite3`. Passwords hashed with `bcryptjs` (no plaintext, ever).
- `SESSION_SECRET` env var with dev fallback; move to `.env` for production. Hardcoded secrets are forbidden.
- DB `server/database.sqlite` auto-creates + seeds `admin/admin` on first run (`server/db.js`). Sessions live in `server/sessions.sqlite`.
- Runtime `*.sqlite*` files and `node_modules` must never be committed.
- `isDefaultPassword` flag drives the change-password dialog; client suppresses it via `localStorage['skipPwChangeDialog']`.

## Backend architecture (mandatory as app grows)
Server is currently monolithic (`index.js` has routes + logic in one file). New features follow the layered structure — refactor existing code as you touch it:

`route → controller → service → repository (better-sqlite3)`
`server/{controllers,services,repositories,middleware,routes,validators,database,config,utils}`

- Routes stay thin; **no business logic in route files**.
- All DB access in repositories via `better-sqlite3` **prepared statements** (`db.prepare("... WHERE id = ?")`) — never string-built SQL, never trust input.
- Use migrations + indexes; wrap multi-step writes in `db.transaction()`.
- Validate every input (body/params/query).
- Response envelope every endpoint:
  - success: `{ "success": true, "data": {}, "message": "..." }`
  - error: `{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }`

## Frontend architecture
- Keep existing `components/` `pages/` `context/`; add `layouts/`, `hooks/`, `services/`, `api/` as features grow.
- Every feature = loading + success + error + empty states.
- Dashboard is the logged-in layout (Navbar: user+logout, Sidebar, `<Outlet/>`). Add pages as **nested routes** under it in `client/src/App.jsx`.

## Git / GitHub
- Repo is **not yet a git repo** — `git init` before the first commit/push. Only commit when the user asks, per request, and push after it.
- Conventional Commits: `feat(auth): ...`, `fix(users): ...`, `refactor(api): ...`, `test(auth): ...`.
- PRs must include Summary / Changes Made / Testing Performed / Potential Risks / Rollback Plan.

## Workflow
Every request: analyze → plan → identify impacted files → implement → test → fix failures → lint/typecheck → refactor → verify feature manually. Report with: ✅ Summary, ✅ Files Modified, ✅ Tests Added, ✅ Tests Executed, ✅ Potential Risks, ✅ Suggested Improvements.
**Never claim something works (or tests pass) unless you actually ran it.**