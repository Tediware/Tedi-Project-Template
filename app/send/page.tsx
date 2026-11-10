import { FailurePanel } from "@/components/status"
import { isApiConfigured, listPartners } from "@/lib/tediware"
import { SendForm } from "./send-form"

export const dynamic = "force-dynamic"

export default async function SendPage() {
  let partnerKeys: string[] = []
  let tsCodes: string[] = []
  let partnerError: string | null = null
  if (isApiConfigured()) {
    try {
      const partners = await listPartners()
      partnerKeys = partners.map((p) => p.key)
      tsCodes = [...new Set(partners.flatMap((p) => p.outboundSets))].sort()
    } catch (error) {
      partnerError = (error as Error).message
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Send</h1>
        <p className="text-sm text-muted-foreground">
          Submit a JSON document to a partner. Tediware maps it to the
          partner&apos;s EDI with the outbound mapping configured for that
          transaction set, then delivers it.
          {!isApiConfigured() &&
            " Tediware is not configured, so the submission is recorded but not sent."}
        </p>
      </div>
      {partnerError && (
        <FailurePanel title="Could not list partners" message={partnerError} />
      )}
      <SendForm partnerKeys={partnerKeys} tsCodes={tsCodes} />
    </div>
  )
}
