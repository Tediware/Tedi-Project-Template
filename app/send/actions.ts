"use server"

import { errorMessageFromBody } from "@/lib/tediware"
import { submitAndRecord } from "@/lib/outbound"

export type SendState = {
  status: "success" | "error"
  message: string
  submissionId?: number
}

/**
 * Submits a hand-written JSON document. This is the generic outbound path;
 * a real app builds `contents` from its own records instead of a textarea and
 * calls submitAndRecord the same way.
 */
export async function sendDocument(formData: FormData): Promise<SendState> {
  const partner = String(formData.get("partner") ?? "").trim()
  const tsCode = String(formData.get("tsCode") ?? "").trim()
  const raw = String(formData.get("contents") ?? "")
  const test = formData.get("test") === "on"

  if (!partner) return { status: "error", message: "Enter a partner key." }
  if (!/^\d{3}$/.test(tsCode)) {
    return {
      status: "error",
      message: "Enter a three-digit transaction set code, e.g. 856.",
    }
  }

  let contents: unknown
  try {
    contents = JSON.parse(raw)
  } catch (error) {
    return {
      status: "error",
      message: `The document is not valid JSON: ${(error as Error).message}`,
    }
  }
  if (
    typeof contents !== "object" ||
    contents === null ||
    Array.isArray(contents)
  ) {
    return {
      status: "error",
      message: "The document must be a JSON object.",
    }
  }

  const { submission, result } = await submitAndRecord({
    partner,
    tsCode,
    contents: contents as Record<string, unknown>,
    options: test ? { usageIndicator: "T" } : {},
  })

  if (result.outcome === "accepted") {
    return {
      status: "success",
      message: result.stubbed
        ? "Recorded. Nothing was sent: Tediware is not configured."
        : "Queued by Tediware. The delivery outcome arrives separately.",
      submissionId: submission.id,
    }
  }
  const reason = errorMessageFromBody(result.responseBody)
  return {
    status: "error",
    message:
      result.outcome === "rejected"
        ? `Tediware rejected the request${reason ? `: ${reason}` : "."}`
        : `Submitting failed${reason ? `: ${reason}` : "."}`,
    submissionId: submission.id,
  }
}
