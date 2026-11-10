"use server"

import { revalidatePath } from "next/cache"

import type { ActionResult } from "@/components/action-button"
import { processReceivedDocument } from "@/lib/inbound"

/**
 * Runs a recorded delivery through processing again: refetch the document,
 * call your handler. For when processing failed and the cause is fixed.
 */
export async function reprocess(documentId: number): Promise<ActionResult> {
  const outcome = await processReceivedDocument(documentId)
  revalidatePath(`/inbound/${documentId}`)
  return outcome.ok
    ? { status: "success", message: "Processed." }
    : { status: "error", message: outcome.error ?? "Processing failed." }
}
