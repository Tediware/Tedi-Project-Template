import "server-only"

import { eq } from "drizzle-orm"

import { db, schema } from "@/db"
import { handleInboundDocument } from "@/lib/handle-inbound"
import { fetchInboundDocument, transactionSetOf } from "@/lib/tediware"

/**
 * Inbound plumbing: recording a webhook delivery and processing it. The
 * webhook route records and acknowledges, then processes after the response
 * is sent; the Reprocess action on a delivery's page calls the same
 * processing. Your own logic lives in handle-inbound.ts, not here.
 */

export type RecordedDelivery =
  | { kind: "new" | "retry"; documentId: number }
  | { kind: "duplicate"; documentId: number }

/**
 * Inserts the delivery, idempotent on result id. A delivery already
 * processed is a duplicate; one that failed or never finished is retried.
 */
export function recordDelivery(delivery: {
  resultExtid: string
  traceGuid: string | null
  requestId: string | null
  rawBody: string
}): RecordedDelivery {
  const [inserted] = db
    .insert(schema.receivedDocuments)
    .values({
      resultExtid: delivery.resultExtid,
      traceGuid: delivery.traceGuid,
      requestId: delivery.requestId,
      rawWebhookBody: delivery.rawBody,
    })
    .onConflictDoNothing({ target: schema.receivedDocuments.resultExtid })
    .returning({ id: schema.receivedDocuments.id })
    .all()
  if (inserted) return { kind: "new", documentId: inserted.id }

  const existing = db
    .select({
      id: schema.receivedDocuments.id,
      status: schema.receivedDocuments.status,
    })
    .from(schema.receivedDocuments)
    .where(eq(schema.receivedDocuments.resultExtid, delivery.resultExtid))
    .get()
  if (!existing) throw new Error("Delivery record vanished after a conflict.")
  return {
    kind: existing.status === "processed" ? "duplicate" : "retry",
    documentId: existing.id,
  }
}

/**
 * Fetches the document for a recorded delivery and hands it to your handler.
 * Never throws: the outcome, success or failure, is written to the row.
 */
export async function processReceivedDocument(
  documentId: number
): Promise<{ ok: boolean; error?: string }> {
  const row = db
    .select()
    .from(schema.receivedDocuments)
    .where(eq(schema.receivedDocuments.id, documentId))
    .get()
  if (!row) return { ok: false, error: `No received document ${documentId}.` }

  try {
    const { result, document } = await fetchInboundDocument(row.resultExtid)
    const partner = result?.detail?.partner?.key?.toUpperCase() ?? null
    const transactionSet = transactionSetOf(result)

    db.update(schema.receivedDocuments)
      .set({
        rawResult: result ? JSON.stringify(result, null, 2) : null,
        rawDocument: JSON.stringify(document, null, 2),
        partner,
        transactionSet,
      })
      .where(eq(schema.receivedDocuments.id, documentId))
      .run()

    // An inbound mapping whose output failed validation is still delivered,
    // flagged. Do not hand a document that failed its own mapping to your
    // code as if it were good.
    if (result?.detail?.mappingFailed) {
      const errors = result.detail.mappingError?.errors ?? []
      throw new Error(
        `Tediware flagged this document's mapping as failed` +
          (errors.length ? `: ${errors.join("; ")}` : ".")
      )
    }

    const handled = await handleInboundDocument({
      resultExtid: row.resultExtid,
      traceGuid: row.traceGuid,
      partner,
      transactionSet,
      usageIndicator: result?.detail?.usageIndicator ?? null,
      result,
      document,
    })

    db.update(schema.receivedDocuments)
      .set({
        status: "processed",
        reference: handled.reference ?? null,
        error: null,
        processedAt: new Date().toISOString(),
      })
      .where(eq(schema.receivedDocuments.id, documentId))
      .run()
    return { ok: true }
  } catch (error) {
    const message = (error as Error).message
    console.error(
      `[inbound] processing result ${row.resultExtid} failed:`,
      message
    )
    db.update(schema.receivedDocuments)
      .set({ status: "failed", error: message })
      .where(eq(schema.receivedDocuments.id, documentId))
      .run()
    return { ok: false, error: message }
  }
}
