import fs from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

import { signWebhookBody } from "../lib/tediware/signature"

/**
 * Dev-only harness: signs and POSTs a webhook notification to the running
 * app, exactly as Tediware would, so every webhook route can be exercised
 * without a live Tediware.
 *
 * Inbound (default): writes a result fixture the app reads in place of the
 * live result fetch, then notifies the inbound webhook.
 *
 *   npm run webhook:send                         # result 900001, sample 850
 *   npm run webhook:send                         # same again: a duplicate
 *   npm run webhook:send -- 900002               # a different result id
 *   npm run webhook:send -- 900003 --document path/to/doc.json
 *
 * Outbound and error: notifies the delivered or failed webhook for a trace,
 * which is how a submission learns its outcome. A stubbed submission's page
 * shows its trace GUID.
 *
 *   npm run webhook:send -- --role outbound --trace <guid>
 *   npm run webhook:send -- --role error --trace <guid>
 *
 * With TEDIWARE_BASE_URL and TEDIWARE_API_KEY set, the app fetches results
 * live, so pass a real result id and no fixture is written.
 *
 * Signs with the secret the app uses for that role, read from .env.local; the
 * app must be running with the same value.
 */

try {
  process.loadEnvFile(path.join(process.cwd(), ".env.local"))
} catch {
  // .env.local is optional; the secret may come from the ambient environment.
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    role: { type: "string", default: "inbound" },
    trace: { type: "string" },
    document: { type: "string" },
  },
})

const role = values.role
if (role !== "inbound" && role !== "outbound" && role !== "error") {
  fail(`--role must be inbound, outbound or error (got ${role}).`)
}

const roleVar = {
  inbound: null,
  outbound: "TEDIWARE_OUTBOUND_WEBHOOK_SECRET",
  error: "TEDIWARE_ERROR_WEBHOOK_SECRET",
}[role]
const secret = (
  (roleVar ? process.env[roleVar] : undefined) ||
  process.env.TEDIWARE_WEBHOOK_SECRET
)?.trim()
if (!secret) {
  fail(
    "TEDIWARE_WEBHOOK_SECRET is not set. Add it to .env.local (any value), " +
      "restart the app so it uses the same secret, then run this again."
  )
}

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(
  /\/+$/,
  ""
)
const resultId =
  positionals[0] ?? (role === "inbound" ? "900001" : `local-${Date.now()}`)
const traceGuid = values.trace ?? crypto.randomUUID()

const liveFetch =
  !!process.env.TEDIWARE_BASE_URL?.trim() &&
  !!process.env.TEDIWARE_API_KEY?.trim()

if (role === "inbound" && !liveFetch) {
  const source =
    values.document ?? path.join(process.cwd(), "fixtures", "sample-850.json")
  const document = JSON.parse(fs.readFileSync(source, "utf8"))
  const fixturesDir = path.join(process.cwd(), "fixtures", "results")
  fs.mkdirSync(fixturesDir, { recursive: true })
  fs.writeFileSync(
    path.join(fixturesDir, `${resultId}.json`),
    JSON.stringify(document, null, 2)
  )
}

// The documented body, the same for every role.
const body = JSON.stringify({
  timestamp: new Date().toISOString(),
  output: { resultId, traceGuid },
})

const route = {
  inbound: "/api/webhooks/tediware",
  outbound: "/api/webhooks/tediware/outbound",
  error: "/api/webhooks/tediware/errors",
}[role]

let response: Response
try {
  response = await fetch(`${appUrl}${route}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Signature": signWebhookBody(body, secret),
      "X-Request-ID": crypto.randomUUID(),
    },
    body,
  })
} catch (error) {
  fail(
    `Could not reach ${appUrl}${route} (${(error as Error).message}). ` +
      "Is the dev server running? Set APP_URL if it is not on port 3000."
  )
}

console.log(`POST ${route} -> ${response.status}`)
console.log(await response.text())
if (!response.ok) process.exit(1)

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}
