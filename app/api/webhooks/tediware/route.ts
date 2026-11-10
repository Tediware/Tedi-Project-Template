import { after } from "next/server"

import { processReceivedDocument, recordDelivery } from "@/lib/inbound"
import { readWebhook } from "@/lib/tediware"

/**
 * Inbound webhook: Tediware says a document is ready. Verify the signature
 * against the raw body, record the delivery, acknowledge, and only then fetch
 * and process the document. Tediware gives a delivery 10 seconds, so nothing
 * slow happens before the response.
 *
 * Idempotency: a redelivery of an already-processed result is acknowledged
 * and ignored. One that failed or never finished is processed again.
 *
 * A 2xx means "recorded", not "processed". Processing failures are stored on
 * the delivery and shown in the app, with a Reprocess action; Tediware does
 * not retry them, since it already got its 200.
 */
export async function POST(request: Request): Promise<Response> {
  const delivery = await readWebhook(request, "inbound")
  if (!delivery.ok) {
    return Response.json({ error: delivery.error }, { status: delivery.status })
  }

  let recorded
  try {
    recorded = recordDelivery(delivery)
  } catch (error) {
    console.error("[webhook:inbound] recording failed:", error)
    // Not recorded, so let Tediware retry.
    return Response.json({ error: "record_failed" }, { status: 500 })
  }

  if (recorded.kind === "duplicate") {
    return Response.json({ status: "duplicate" })
  }

  after(() => processReceivedDocument(recorded.documentId))
  return Response.json({ status: "received" })
}
