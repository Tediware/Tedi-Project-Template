import { apiGetJson } from "./client"
import type { EdiTransaction } from "./edi-transactions"
import { safeId, type ResultResponse } from "./results"

/**
 * Everything the platform knows about one processing run. This is the thing
 * to poll after a submission when webhooks cannot reach you (on localhost
 * without a tunnel, for example): `processing` turns false when the run has
 * finished, and the transactions and results say how it went.
 */

export type Trace = {
  traceGuid: string
  processing: boolean
  ediTransactions: EdiTransaction[]
  /** Oldest first. */
  results: ResultResponse[]
}

export async function fetchTrace(traceGuid: string): Promise<Trace> {
  return apiGetJson<Trace>(`/platform/traces/${safeId("trace", traceGuid)}`)
}

/** The failed steps on a trace, with their messages, oldest first. */
export function traceFailures(
  trace: Trace
): { nodeName: string; message: string; errors: string[] }[] {
  return trace.results
    .filter((r) => r.status === "error" || r.detail?.errorMessage)
    .map((r) => ({
      nodeName: r.nodeName,
      message: r.detail?.errorMessage ?? "Step failed without a message.",
      errors: r.detail?.errors ?? [],
    }))
}
