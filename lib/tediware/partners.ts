import { apiGetJson } from "./client"

/**
 * Your organization's trading partners, read-only. Partners, flows, mappings
 * and webhooks are configured in the Tediware app; the API reads them.
 *
 * Preview: Tediware says these response shapes may change without notice and
 * nothing critical should depend on them. The template uses them only to
 * suggest partner keys on the Send page, and works without them.
 */

export type PartnerSummary = {
  id: string
  /** Returned uppercase; resolves in any case in URLs. */
  key: string
  name: string
  inboundSets: string[]
  outboundSets: string[]
  /** A flow must be "active" before documents move in that direction. */
  flows: { direction: "inbound" | "outbound"; status: string }[]
}

export async function listPartners(): Promise<PartnerSummary[]> {
  const response = await apiGetJson<{ partners: PartnerSummary[] }>(
    "/platform/partners?limit=100"
  )
  return response.partners
}
