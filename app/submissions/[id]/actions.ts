"use server"

import { revalidatePath } from "next/cache"

import type { ActionResult } from "@/components/action-button"
import { resendSubmission } from "@/lib/outbound"
import { isApiConfigured } from "@/lib/tediware"

export async function resend(submissionId: number): Promise<ActionResult> {
  if (!isApiConfigured()) {
    return {
      status: "error",
      message: "Set TEDIWARE_BASE_URL and TEDIWARE_API_KEY to resend.",
    }
  }
  try {
    const result = await resendSubmission(submissionId)
    revalidatePath(`/submissions/${submissionId}`)
    if (result.outcome === "started") {
      return {
        status: "success",
        message: "Resend started. The outcome arrives on the same trace.",
      }
    }
    return {
      status: "error",
      message:
        result.outcome === "rejected"
          ? `Tediware declined the resend: ${result.message}`
          : `Resend failed: ${result.message}`,
    }
  } catch (error) {
    return {
      status: "error",
      message: `Resend failed: ${(error as Error).message}`,
    }
  }
}
