import "server-only"

import type { ResultResponse } from "@/lib/tediware"
import {
  bySuffix,
  element,
  isRecord,
  segment,
  str,
} from "@/lib/tediware/x12-json"

/**
 * YOUR CODE GOES HERE.
 *
 * Called once per inbound document, after the webhook was verified and
 * acknowledged and the document was downloaded. By the time this runs the
 * delivery is already recorded in received_documents with the raw JSON, so
 * this function only has to do your part: translate the document into your
 * own shapes (validate them with zod), write your own tables, kick off your
 * own work.
 *
 * Contract:
 * - Return normally to mark the delivery processed. `reference` is shown in
 *   the Activity list; use whatever identifies the document to a person.
 * - Throw to mark it failed. The message is stored and shown, and the
 *   delivery can be reprocessed from its page once the cause is fixed.
 * - Be idempotent. Reprocessing calls this again with the same document, so
 *   key your own writes on something stable (partner + PO number, say).
 *
 * The default below only reads a reference number out of common X12 header
 * segments, so the template does something visible out of the box.
 */

export type InboundDocument = {
  resultExtid: string
  traceGuid: string | null
  /** Partner key from the result detail, uppercase. Null when absent. */
  partner: string | null
  /** e.g. "850". Null when the result does not name one. */
  transactionSet: string | null
  /**
   * ISA15: "T" for a test interchange, "P" for production, null when unknown
   * (fixtures, older results). Test documents arrive through the same flow
   * and webhook as production ones; check this before acting on one.
   */
  usageIndicator: "P" | "T" | null
  /** Result metadata. Null when the document came from a local fixture. */
  result: ResultResponse | null
  /** The downloaded JSON document. */
  document: unknown
}

export type HandledInbound = { reference?: string | null }

export async function handleInboundDocument(
  inbound: InboundDocument
): Promise<HandledInbound> {
  return { reference: headerReference(inbound.document) }
}

/**
 * The business reference in an X12-shaped document's header, when it has
 * one of the common ones: BEG03 (850 PO number), BIG02 (810 invoice number),
 * BSN02 (856 shipment id), BCH03 (860 PO number), BAK03 (855 PO number).
 */
function headerReference(document: unknown): string | null {
  if (!isRecord(document)) return null
  const heading = bySuffix(document, "heading")
  if (!isRecord(heading)) return null
  const candidates: [string, string][] = [
    ["BEG", "03"],
    ["BIG", "02"],
    ["BSN", "02"],
    ["BCH", "03"],
    ["BAK", "03"],
  ]
  for (const [tag, position] of candidates) {
    const value = str(element(segment(heading, tag), position))
    if (value) return value
  }
  return null
}
