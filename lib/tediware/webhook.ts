import { getSigningConfig, type WebhookRole } from "./env"
import { verifyWebhookSignature } from "./signature"

/**
 * Reading a webhook delivery: log it, verify the signature against the raw
 * body, parse the notification. Every webhook route starts here; what each
 * route does with the notification differs, receiving one does not.
 *
 * Every role sends the same body, identifiers only, never the document:
 * `{timestamp, output: {resultId, traceGuid}}`. The document is fetched
 * separately (see results.ts). `timestamp` is when the result was ready and
 * is identical on every attempt; the per-attempt id is the X-Request-ID
 * header, which changes on a redelivery while resultId does not.
 */

export type WebhookNotification = {
  timestamp?: string
  output?: { resultId?: number | string; traceGuid?: string }
}

export type ReadWebhookResult =
  | {
      ok: true
      rawBody: string
      notification: WebhookNotification
      resultExtid: string
      traceGuid: string | null
      requestId: string | null
    }
  | { ok: false; status: number; error: string }

export async function readWebhook(
  request: Request,
  role: WebhookRole
): Promise<ReadWebhookResult> {
  const tag = `[webhook:${role}]`
  // Read the raw body once, before any parsing: the signature covers these
  // exact bytes, and re-serialized JSON would not match.
  const rawBody = await request.text()

  // One line per attempt, so redeliveries of the same result can be told
  // apart and timed. t= is Tediware's signing time for this attempt.
  const signedAt = /t=(\d+)/.exec(
    request.headers.get("X-Webhook-Signature") ?? ""
  )?.[1]
  console.log(
    `${tag} attempt x-request-id=${request.headers.get("X-Request-ID") ?? "-"} signed-t=${signedAt ?? "-"} body=${rawBody}`
  )

  let signing
  try {
    signing = getSigningConfig(role)
  } catch (error) {
    console.error(`${tag} cannot verify:`, (error as Error).message)
    return { ok: false, status: 500, error: "webhook_secret_not_configured" }
  }

  const verdict = verifyWebhookSignature(
    rawBody,
    request.headers.get("X-Webhook-Signature"),
    signing
  )
  if (!verdict.valid) {
    console.warn(`${tag} rejected: ${verdict.reason}`)
    return { ok: false, status: 401, error: verdict.reason }
  }

  let notification: WebhookNotification
  try {
    notification = JSON.parse(rawBody)
  } catch {
    return { ok: false, status: 400, error: "invalid_json" }
  }

  const resultId = notification.output?.resultId
  if (resultId === undefined || resultId === null) {
    return { ok: false, status: 400, error: "missing_result_id" }
  }

  return {
    ok: true,
    rawBody,
    notification,
    resultExtid: String(resultId),
    traceGuid: notification.output?.traceGuid ?? null,
    requestId: request.headers.get("X-Request-ID"),
  }
}
