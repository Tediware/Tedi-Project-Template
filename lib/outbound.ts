import "server-only"

import { eq } from "drizzle-orm"

import { db, schema } from "@/db"
import type { OutboundSubmission } from "@/db/schema"
import {
  listEdiTransactionsForTrace,
  resendEdiTransaction,
  submitTransaction,
  type ResendResult,
  type SubmitOptions,
  type SubmitResult,
} from "@/lib/tediware"

/**
 * Outbound plumbing. Build your document however your domain does, then call
 * submitAndRecord: it submits and always records the attempt, whatever the
 * outcome, so every payload that left the app can be inspected later.
 */
export async function submitAndRecord(input: {
  partner: string
  tsCode: string
  contents: Record<string, unknown>
  options?: SubmitOptions
}): Promise<{ submission: OutboundSubmission; result: SubmitResult }> {
  const partner = input.partner.trim().toUpperCase()
  const tsCode = input.tsCode.trim()
  const result = await submitTransaction(
    partner,
    tsCode,
    input.contents,
    input.options
  )

  const submission = db
    .insert(schema.outboundSubmissions)
    .values({
      partner,
      tsCode,
      usageIndicator: input.options?.usageIndicator ?? null,
      requestPayload: JSON.stringify(input.contents, null, 2),
      responseStatus: result.responseStatus,
      responseBody: result.responseBody,
      outcome: result.outcome,
      stubbed: result.stubbed,
      traceGuid: result.traceGuid,
      ediTransactionExtid: result.ediTransactionId,
    })
    .returning()
    .get()

  return { submission, result }
}

/**
 * Resends an accepted submission whose delivery failed or that the partner
 * says never arrived. Nothing new is recorded locally: Tediware puts the
 * resend on the original trace, so its outcome arrives on the same webhooks
 * and trace as the first attempt.
 */
export async function resendSubmission(
  submissionId: number
): Promise<ResendResult> {
  const submission = db
    .select()
    .from(schema.outboundSubmissions)
    .where(eq(schema.outboundSubmissions.id, submissionId))
    .get()
  if (!submission) {
    return { outcome: "error", message: `No submission ${submissionId}.` }
  }

  let transactionId = submission.ediTransactionExtid
  if (!transactionId && submission.traceGuid) {
    // Older receipts did not carry the transaction id; find it by trace.
    const transactions = await listEdiTransactionsForTrace(submission.traceGuid)
    transactionId =
      transactions.find((t) => t.direction === "outbound")?.id ?? null
  }
  if (!transactionId) {
    return {
      outcome: "rejected",
      message: "Tediware has no transaction for this submission to resend.",
    }
  }
  return resendEdiTransaction(transactionId)
}
