import { apiRequest, TediwareError } from "./client"
import { isApiConfigured } from "./env"

/**
 * Submitting an outbound document. Tediware maps your JSON to the partner's
 * EDI and delivers it.
 *
 * `POST /platform/partners/:key/ts/:code` with body `{contents, filename?,
 * overrides?}`, where `contents` is your JSON object (the envelope is easy to
 * miss). A 200 means "Processing queued" and nothing more: validation,
 * translation and delivery run afterwards, so a document that will fail still
 * answers 200 here and fails on its trace seconds later. The outcome arrives
 * on the outbound or error webhook, or by polling the trace (traces.ts).
 *
 * A synchronous non-2xx (bad request, unknown partner or transaction set,
 * configuration error) is a normal, expected outcome, so it is returned as
 * "rejected" rather than thrown. Submissions are not idempotent (each POST
 * consumes control numbers), so nothing here retries.
 */

export type SubmitOptions = {
  /**
   * ISA15 for this one submission: "T" sends it as a test interchange, "P" as
   * production. Omit to use the transaction set's configured value.
   */
  usageIndicator?: "P" | "T"
  filename?: string
}

export type SubmitResult = {
  outcome: "accepted" | "rejected" | "error"
  responseStatus: number | null
  responseBody: string
  /** Links every processing result for this submission. */
  traceGuid: string | null
  /** The transmission Tediware created; what resend takes. */
  ediTransactionId: string | null
  /** True when the submission was recorded without contacting Tediware. */
  stubbed: boolean
}

export async function submitTransaction(
  /** Partner key, e.g. "ACME". Keys resolve in any case. */
  partner: string,
  /** Transaction set code, e.g. "856" or "810". */
  tsCode: string,
  contents: Record<string, unknown>,
  options: SubmitOptions = {}
): Promise<SubmitResult> {
  if (!isApiConfigured()) {
    return {
      outcome: "accepted",
      responseStatus: null,
      responseBody: JSON.stringify({
        note: "Submission stubbed; Tediware is not configured. Set TEDIWARE_BASE_URL and TEDIWARE_API_KEY to send for real.",
      }),
      // A local stand-in, so the delivery webhooks can be exercised against
      // this submission with `npm run webhook:send -- --role outbound --trace <guid>`.
      traceGuid: crypto.randomUUID(),
      ediTransactionId: null,
      stubbed: true,
    }
  }

  const path = `/platform/partners/${encodeURIComponent(partner.trim())}/ts/${encodeURIComponent(tsCode.trim())}`
  const body: Record<string, unknown> = { contents }
  if (options.filename) body.filename = options.filename
  if (options.usageIndicator) {
    body.overrides = { usageIndicator: options.usageIndicator }
  }

  try {
    const response = await apiRequest(path, {
      method: "POST",
      body: JSON.stringify(body),
    })
    const text = await response.text()

    if (response.ok) {
      const receipt = parseReceipt(text)
      return {
        outcome: "accepted",
        responseStatus: response.status,
        responseBody: text,
        traceGuid: receipt.traceGuid,
        ediTransactionId: receipt.ediTransactionId,
        stubbed: false,
      }
    }

    console.error(
      `[tediware] ${tsCode} submission to ${partner} returned ${response.status}: ${text}`
    )
    // Documented request failures: 400 missing or invalid parameter, 404
    // partner or transaction set not configured (or no active flow), 422
    // configuration error.
    return {
      outcome: [400, 404, 422].includes(response.status) ? "rejected" : "error",
      responseStatus: response.status,
      responseBody: text,
      traceGuid: null,
      ediTransactionId: null,
      stubbed: false,
    }
  } catch (cause) {
    const message =
      cause instanceof TediwareError ? cause.message : String(cause)
    console.error(
      `[tediware] ${tsCode} submission to ${partner} failed: ${message}`
    )
    return {
      outcome: "error",
      responseStatus: null,
      responseBody: JSON.stringify({ error: { message } }),
      traceGuid: null,
      ediTransactionId: null,
      stubbed: false,
    }
  }
}

function parseReceipt(body: string): {
  traceGuid: string | null
  ediTransactionId: string | null
} {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const text = (value: unknown) => (typeof value === "string" ? value : null)
    return {
      traceGuid: text(parsed.traceGuid),
      ediTransactionId: text(parsed.ediTransactionId),
    }
  } catch {
    return { traceGuid: null, ediTransactionId: null }
  }
}
