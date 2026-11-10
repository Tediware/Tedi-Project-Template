import {
  apiGetJson,
  apiRequest,
  errorMessageFromBody,
  TediwareError,
} from "./client"
import { safeId } from "./results"

/**
 * EDI transactions: one row per document Tediware sent or received, and the
 * handle for resending one.
 *
 * Resend re-uploads an outbound document's stored bytes under the original
 * control numbers, for when the partner never received it. It lands on the
 * original trace and creates no new transaction record. A 202 means the resend
 * started, not that it was delivered.
 */

export type EdiTransaction = {
  id: string
  direction: "inbound" | "outbound"
  transactionSetIdentifier: string
  traceGuid: string
  partnerKey: string | null
  /** Business reference: the PO number on an 850, invoice number on an 810. */
  reference: string | null
  status: "processing" | "delivered" | "error"
  deliveredAt: string | null
}

export type ResendResult =
  | { outcome: "started"; ediTransactionId: string }
  // Documented, expected refusals: not found, content unavailable, rate
  // limited (resend has its own tighter limit), and so on.
  | { outcome: "rejected"; message: string }
  | { outcome: "error"; message: string }

/** Every transaction on one trace, newest first. */
export async function listEdiTransactionsForTrace(
  traceGuid: string
): Promise<EdiTransaction[]> {
  const params = new URLSearchParams({ trace: traceGuid })
  const response = await apiGetJson<{ ediTransactions: EdiTransaction[] }>(
    `/platform/edi_transactions?${params.toString()}`
  )
  return response.ediTransactions
}

/** Redelivers a past outbound transaction byte for byte. */
export async function resendEdiTransaction(id: string): Promise<ResendResult> {
  try {
    const response = await apiRequest(
      `/platform/edi_transactions/${safeId("edi transaction", id)}/resend`,
      { method: "POST" }
    )
    const text = await response.text()

    if (response.status === 202) {
      let ediTransactionId = id
      try {
        const body = JSON.parse(text) as { ediTransactionId?: unknown }
        if (typeof body.ediTransactionId === "string") {
          ediTransactionId = body.ediTransactionId
        }
      } catch {
        // A 202 is the answer; the body only echoes the id.
      }
      return { outcome: "started", ediTransactionId }
    }

    if ([401, 403, 404, 422, 429].includes(response.status)) {
      return {
        outcome: "rejected",
        message: errorMessageFromBody(text) ?? text,
      }
    }
    return { outcome: "error", message: `HTTP ${response.status}: ${text}` }
  } catch (cause) {
    const message =
      cause instanceof TediwareError ? cause.message : String(cause)
    return { outcome: "error", message }
  }
}
