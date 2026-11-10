# Tediware project template

A starting point for apps built on [Tediware](https://tediware.com). Tediware
turns your trading partners' EDI into JSON and your JSON into their EDI; this
template is the app on the other side of that: it receives documents through
webhooks, sends documents through the API, and keeps an inspectable record of
everything that crossed the wire.

It ships the integration plumbing every Tediware app needs, and none of the
domain code. You add that.

## What's in the box

- **Inbound webhook** with HMAC signature verification against the raw body,
  idempotent recording, a fast acknowledgement, and fetching the document
  after the response (result metadata, then the JSON artifact).
- **Outbound submission** with the `{contents}` envelope, test-mode sends
  (ISA15 = T), and a record of every attempt whatever the outcome.
- **Delivery outcomes** from the outbound and error webhooks, joined to the
  submission by trace, plus a live trace view for when webhooks cannot reach
  you. Resend for documents a partner never received.
- **An Activity UI** listing every inbound delivery and outbound submission,
  with the raw JSON of each, a Send page for hand-written documents, and
  Reprocess for failed inbound deliveries.
- **Local-first development.** Nothing needs configuring to start. A harness
  signs and sends webhooks to the running app, and fixtures stand in for the
  API.
- **Agent setup.** `AGENTS.md` (imported by `CLAUDE.md`) points coding agents
  at Tediware's own agent instructions, and `.mcp.json` registers the
  Tediware MCP server with the same key as the `tedi` CLI.
- **Tests** for signature verification, with a worked example you can check
  another implementation against, and for the X12-JSON helpers.

Stack: Next.js (App Router) and TypeScript, shadcn/ui and Tailwind, SQLite
through Drizzle. No auth; add your own before deploying anywhere shared.

## Quick start

Requires Node 24 (`nvm use` reads `.nvmrc`).

```bash
npm install
cp .env.example .env.local
# set TEDIWARE_WEBHOOK_SECRET to any value in .env.local
npm run dev                    # http://localhost:3000
```

`npm run dev` and `npm start` apply pending migrations first, creating
`data/app.db` if it does not exist. Starting `next dev` directly skips that.

In a second terminal, play Tediware:

```bash
npm run webhook:send           # an inbound 850 arrives (fixtures/sample-850.json)
npm run webhook:send           # the same delivery again: acknowledged as a duplicate
```

Then open the Send page, submit any JSON object to any partner key, and copy
the trace GUID from the submission page to simulate its outcome:

```bash
npm run webhook:send -- --role outbound --trace <guid>   # delivered
npm run webhook:send -- --role error --trace <guid>      # failed
```

## Connecting to Tediware

1. Create an API key at https://tediware.com/app/api-keys and set
   `TEDIWARE_BASE_URL` and `TEDIWARE_API_KEY` in `.env.local`. Restart; the
   server prints which capabilities are live.
2. In the Tediware app, point each partner's webhooks at this app and copy
   each webhook's signing secret into `.env.local`:

   | Webhook  | URL                              | Secret                             |
   | -------- | -------------------------------- | ---------------------------------- |
   | Inbound  | `/api/webhooks/tediware`         | `TEDIWARE_WEBHOOK_SECRET`          |
   | Outbound | `/api/webhooks/tediware/outbound` | `TEDIWARE_OUTBOUND_WEBHOOK_SECRET` |
   | Error    | `/api/webhooks/tediware/errors`  | `TEDIWARE_ERROR_WEBHOOK_SECRET`    |

   Outbound and error deliveries have identical bodies, so they need separate
   webhooks: the route is what tells them apart.
3. Tediware has to reach the app over the internet. During development, use
   a tunnel (for example `cloudflared tunnel --url http://localhost:3000` or
   `ngrok http 3000`) and use its URL. Without one, outbound still works:
   the submission page reads the outcome from the trace.

### Failed inbound documents are yours to watch

The inbound webhook answers Tediware as soon as the delivery is recorded and
processes the document afterwards, because Tediware gives a webhook 10
seconds and asks for the slow work to happen after the reply. The trade-off:
Tediware has already been told the delivery succeeded, so if processing then
fails, even for a temporary reason such as a slow API call, **Tediware does
not retry it and does not show it as failed.** The failure is recorded only in
this app: the delivery is marked `failed` in Activity, with the error on its
page and a **Reprocess** button.

So check Activity for failed deliveries, or build something that alerts you
to them before you rely on this in production. If you would rather have
Tediware retry, process inside the request instead of in `after()` and return
a 5xx on failure, keeping the whole thing well under 10 seconds.

Partners, flows and mappings are configured in the Tediware app, not through
the API. `npx @tediware/tedi partner list` shows what is set up and what is
not ready.

The platform's own documentation is the reference for everything above:
[coding agent instructions](https://tediware.com/tediware-coding-agent-instructions.md)
(useful to people too) and the
[MCP documentation](https://tediware.com/resources/api-docs/mcp).

## Working with coding agents

`AGENTS.md` is the agent guide for this repository. It sends agents to
Tediware's published agent instructions first, describes the layout, and sets
the rules: scrub EDI before it leaves the machine, and ask before anything
that sends, resends or redelivers a document.

The `tedi` CLI is a dev dependency. Run it as `npx @tediware/tedi`, not
`npx tedi`: before `npm install`, `npx tedi` fetches and runs an unrelated
package that happens to be called `tedi` on npm, without asking when there
is no terminal (as when an agent starts it). The scoped name always gets
Tediware's CLI, the local copy once installed.

The MCP server registered in `.mcp.json` uses the CLI's stored key. Create a
standard key at https://tediware.com/app/api-keys and store it once per
machine:

```bash
npx @tediware/tedi auth login
npx @tediware/tedi whoami
```

Until you do, the MCP server fails to connect. Nothing in Quick start needs
it. If you use the CLI with more than one Tediware organization, store this
project's key under a named profile (`--profile <name>`) and add the same
flag to `.mcp.json`.

`.mcp.json` is read by Claude Code. Other agents keep MCP servers in their
own config; register the same command there:
`npx @tediware/tedi mcp serve`.

### Keys: standard while you build, read-only once you are live

A standard key can send, receive and resend documents; a read-only key can
only look. While you are building against the sandbox partner, an agent
needs to send test traffic in both directions, so start with a standard key.
Two things keep that in check: `AGENTS.md` tells agents to ask before any
send, resend or redelivery, and Claude Code asks before each MCP tool call
that is not on its allowlist. Keep Tediware's write tools off it.

Once the integration is built and real partners are connected, give the
agent a read-only key, as Tediware's MCP documentation recommends for agents
whose job does not include sending. Keep the standard key in a named profile
for the sends you make on purpose:

```bash
npx @tediware/tedi auth login                      # paste the read-only key: CLI and MCP now use it
npx @tediware/tedi auth login --profile standard   # the standard key, used only with --profile standard
```

If an agent later needs to send again, register a second MCP server with
that profile and turn it on only for the task:

```bash
claude mcp add tediware-send -- npx @tediware/tedi mcp serve --profile standard
```

## Making it yours

1. Rename the app in `package.json` and `lib/site.ts`.
2. Fill in `docs/BRIEF.md`, then design your own document shapes in
   `docs/SCHEMAS.md` before writing integration code.
3. Replace the "What this project is" section of `AGENTS.md`.
4. Put inbound domain logic in `lib/handle-inbound.ts`. The default only
   pulls a reference number from the document header.
5. Build outbound documents from your own data and send them with
   `submitAndRecord` (`lib/outbound.ts`). Keep or remove the Send page.
6. Add domain tables to `db/schema.ts`, then `npm run db:generate` and
   `npm run db:migrate`.
7. Log integration friction in `docs/NOTES.md` as it happens.

## Layout

```
app/
  page.tsx                     Activity: inbound, outbound, stray errors
  inbound/[id]/                One delivery: document, result, Reprocess
  submissions/[id]/            One submission: payload, outcome, trace, Resend
  send/                        Submit a hand-written JSON document
  api/webhooks/tediware/       Inbound, outbound and error webhook routes
lib/
  tediware/                    The only code that talks to Tediware
  handle-inbound.ts            Your inbound logic goes here
  inbound.ts, outbound.ts      Recording and processing plumbing
  delivery-notifications.ts    Outbound and error webhook processing
  queries.ts                   Reads for the UI
db/                            Drizzle schema, migrations, connection
scripts/send-webhook.ts        Local webhook harness
fixtures/sample-850.json       What an inbound document looks like
docs/                          Brief, shapes, friction log
```

## Scripts

| Command                | Does                                                |
| ---------------------- | --------------------------------------------------- |
| `npm run dev`          | Apply migrations, then start the dev server.        |
| `npm run check`        | Typecheck, lint and test.                           |
| `npm run build`        | Production build.                                   |
| `npm run db:generate`  | Generate a migration after editing `db/schema.ts`.  |
| `npm run db:migrate`   | Apply migrations.                                   |
| `npm run db:reset`     | Delete the database and migrate again.              |
| `npm run webhook:send` | Sign and send a webhook to the running app.         |

## License

MIT; see `LICENSE`. The `tedi` CLI, a dev dependency installed from npm, has
its own license. Report security issues as described in `SECURITY.md`.
