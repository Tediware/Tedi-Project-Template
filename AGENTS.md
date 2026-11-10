# AGENTS.md

Guidance for coding agents (Claude Code, Codex, Cursor and others) working in
this repository. `CLAUDE.md` imports this file; edit this one.

## Read these first

Tediware publishes two documents for agents. They are the authority on how the
platform behaves; this file covers only how this repository uses it. Where the
two disagree, Tediware's documents win, and the code here should be fixed.

1. **Coding agent instructions for Tediware:**
   https://tediware.com/tediware-coding-agent-instructions.md
   Authentication, webhooks and their retry and timeout rules, fetching
   results and artifacts, submitting outbound documents, partner keys, error
   shapes, rate limits.
2. **Tediware MCP documentation:**
   https://tediware.com/resources/api-docs/mcp
   The MCP server, its tools, key scopes, and the safety guidance for agents
   that can send documents.

Fetch them at the start of any task that touches the integration. Do not rely
on memory of them; they change.

## What this project is

<!-- Replace this section when you start a project from the template. Keep it
short; the detail goes in docs/BRIEF.md. -->

A Next.js app that integrates with Tediware: it receives documents from
trading partners as JSON through webhooks and sends JSON documents that
Tediware maps to the partner's EDI. The app never builds or parses raw EDI.

See `docs/BRIEF.md` for intent and scope, `docs/SCHEMAS.md` for this app's
own document shapes, and `docs/NOTES.md` for the integration friction log.

## Commands

```bash
npm run dev            # migrate, then dev server at http://localhost:3000
npm run check          # typecheck + lint + tests; run before calling work done
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm test               # node:test via tsx, files named *.test.ts
npm run format         # prettier over ts/tsx
npm run build          # production build
npm run db:generate    # drizzle-kit generate, after editing db/schema.ts
npm run db:migrate     # apply migrations (creates data/app.db)
npm run db:reset       # delete data/app.db and migrate (the normal reset path)
npm run webhook:send   # sign and POST a webhook to the running app (see below)
```

Verification is `npm run check` plus exercising the flow: `webhook:send` for
inbound, the Send page for outbound, then `webhook:send -- --role
outbound|error --trace <guid>` for the delivery outcome.

Requires Node 24 (`.nvmrc` pins the version; `nvm use`).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may
all differ from your training data. Read the relevant guide in
`node_modules/next/dist/docs/` before writing any code. Heed deprecation
notices.

<!-- END:nextjs-agent-rules -->

## Architecture

### lib/tediware/: the only code that talks to Tediware

Route handlers, server actions and scripts call it; nothing else fetches
Tediware URLs. Keep it small and plain (no retry frameworks, no queues).

- `env.ts`: config validated per capability. The app runs with nothing set:
  signature verification needs only `TEDIWARE_WEBHOOK_SECRET`; everything
  that calls the API needs `TEDIWARE_BASE_URL` + `TEDIWARE_API_KEY`. Getters
  throw naming exactly what is missing.
- `client.ts`: base URL, `Authorization: Key` header, 429 `Retry-After`,
  timeouts, error normalization. Retries only 429; submissions are not
  idempotent.
- `signature.ts`, `webhook.ts`: verify `X-Webhook-Signature` against the raw
  body before parsing; `readWebhook(request, role)` starts every webhook route.
- `results.ts`: result metadata, then the `usage: "output"` JSON artifact.
  Unconfigured, reads `fixtures/results/<id>.json` instead.
- `submit.ts`: `POST /platform/partners/:key/ts/:code` with `{contents}`. A
  200 means queued, not delivered. Rejections are returned, not thrown.
- `edi-transactions.ts`, `traces.ts`, `partners.ts`: resend, trace polling,
  partner listing.
- `x12-json.ts`: helpers for reading the X12-shaped JSON Tediware delivers
  inbound. Select by segment tag, element position and qualifier code, never
  by a partner-specific value.

Response shapes not yet confirmed against a live Tediware are marked
`// CONFIRM:`. Keep that convention when adding provisional types.

### Inbound: webhook, then fetch, then your handler

`app/api/webhooks/tediware/route.ts` verifies, records the delivery in
`received_documents` (idempotent on `result_extid`), answers 200, and only
then fetches and processes the document via `after()`. Tediware allows a
webhook 10 seconds, so nothing slow happens before the response. The cost:
a processing failure after the 200 is never retried by Tediware and never
shows as failed there; it exists only as a `failed` row in this app.
`lib/inbound.ts` is the plumbing; it refuses documents whose result says
`mappingFailed`. **Domain logic goes in `lib/handle-inbound.ts`**, which must
be idempotent because a failed delivery can be reprocessed from its page.

### Outbound: submit, record, learn the outcome later

Build the document in your own code, then call `submitAndRecord` in
`lib/outbound.ts`. It always records the attempt in `outbound_submissions`.
The outcome arrives on the outbound (delivered) or error webhook
(`app/api/webhooks/tediware/outbound`, `.../errors`), recorded in
`delivery_notifications` and joined to the submission by `trace_guid`. The
submission page also reads the trace live, for machines webhooks cannot reach.

### Data (db/)

Drizzle + better-sqlite3, synchronous API (`.get()`, `.all()`, `.run()`).
The three tables are the integration's audit log; add domain tables beside
them and link to these rows. Columns holding Tediware identifiers end in
`_extid`, never `_id`. The database file is disposable.

### UI

Server components by default; client components only for interactivity.
shadcn/ui + Tailwind. Every payload that crossed the wire is viewable
verbatim (`components/json-viewer.tsx`); keep that true for new features.

## Tediware tools for agents

- **CLI:** `npx @tediware/tedi` (a dev dependency). Never `npx tedi`: an
  unrelated npm package has that name, and npx installs it without asking
  when there is no terminal. `npx @tediware/tedi --help` and
  `npx @tediware/tedi <command> --help` are the reference. Use `--json` when
  reading output programmatically. Exit codes: 0 clean, 1 a finding, 2 did
  not run. Never treat 2 as a pass.
- **MCP:** `.mcp.json` registers `tediware` with the CLI's default profile.
  It needs `npx @tediware/tedi auth login` once per machine. During the
  build that is a standard key, which can send; once live it should be
  read-only (README, "Keys"). Either way the rule below applies.
- **Scrub before sharing:** run `npx @tediware/tedi edi obfuscate <file>` on
  any EDI file before reading it into context, pasting it, or sending it
  anywhere.
- **Ask before acting on the platform.** Never send, receive, resend or
  redeliver a document, or submit a suggestion to Tediware, without the
  user's explicit go-ahead for that specific action. Use
  `usageIndicator: "T"` for test sends.
- Partners, flows, mappings and webhooks are configured only in the Tediware
  app. If a task needs a configuration change, say what to change and where;
  do not look for an API to do it.

## Working notes discipline

Whenever integrating with Tediware is confusing, under-documented, or needs a
question the docs should have answered, add one raw line to `docs/NOTES.md`
at the moment it happens, under the right heading. Do not polish it.

## Style

- Comments explain why, not what. Match the density of the surrounding code.
- UI copy is plain and concrete.
- No secrets in code or fixtures. Configuration comes from the environment.
