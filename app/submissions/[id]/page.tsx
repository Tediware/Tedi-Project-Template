import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ActionButton } from "@/components/action-button"
import { JsonViewer } from "@/components/json-viewer"
import {
  DeliveryBadge,
  FailurePanel,
  Fields,
  OutcomeBadge,
  failureSummary,
} from "@/components/status"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDateTime } from "@/lib/format"
import { getSubmissionDetail } from "@/lib/queries"
import {
  fetchTrace,
  isApiConfigured,
  traceFailures,
  type Trace,
} from "@/lib/tediware"
import { resend } from "./actions"

export const dynamic = "force-dynamic"

export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = getSubmissionDetail(Number(id))
  if (!detail) notFound()
  const { submission: s, delivery, notifications } = detail

  // The trace answers "how did it go" without webhooks, which matters on a
  // machine Tediware cannot reach. Read it live on every view.
  let trace: Trace | null = null
  let traceError: string | null = null
  if (s.traceGuid && !s.stubbed && isApiConfigured()) {
    try {
      trace = await fetchTrace(s.traceGuid)
    } catch (error) {
      traceError = (error as Error).message
    }
  }

  const failure =
    delivery?.status === "failed" && delivery.notification
      ? failureSummary(delivery.notification)
      : null
  const canResend = s.outcome === "accepted" && !s.stubbed && isApiConfigured()

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> Activity
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {s.tsCode} to {s.partner}
          </h1>
          <p className="text-sm text-muted-foreground">
            Submitted {formatDateTime(s.submittedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <OutcomeBadge outcome={s.outcome} stubbed={s.stubbed} />
          {delivery && <DeliveryBadge status={delivery.status} />}
          {canResend && (
            <ActionButton
              action={resend.bind(null, s.id)}
              label="Resend"
              pendingLabel="Resending..."
            />
          )}
        </div>
      </div>

      {s.outcome !== "accepted" && (
        <FailurePanel
          title={
            s.outcome === "rejected"
              ? "Tediware rejected the request"
              : "The request failed"
          }
          message={s.responseBody ?? "No response body."}
        />
      )}

      {failure && (
        <FailurePanel
          title={failure.node ? `Failed at ${failure.node}` : "Delivery failed"}
          message={failure.message}
          errors={failure.errors}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Submission</CardTitle>
        </CardHeader>
        <CardContent>
          <Fields
            items={[
              ["Partner", s.partner],
              ["Transaction set", s.tsCode],
              ["Usage indicator", s.usageIndicator ?? "set default"],
              ["HTTP status", s.responseStatus ?? "-"],
              ["Trace", <code key="t">{s.traceGuid ?? "-"}</code>],
              [
                "EDI transaction",
                <code key="e">{s.ediTransactionExtid ?? "-"}</code>,
              ],
            ]}
          />
        </CardContent>
      </Card>

      {s.stubbed && s.traceGuid && (
        <Card>
          <CardHeader>
            <CardTitle>Simulate the outcome</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              Nothing was sent. To see how a delivery outcome lands, with the
              dev server running:
            </p>
            <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
              {`npm run webhook:send -- --role outbound --trace ${s.traceGuid}\nnpm run webhook:send -- --role error --trace ${s.traceGuid}`}
            </pre>
          </CardContent>
        </Card>
      )}

      {s.traceGuid && !s.stubbed && (
        <Card>
          <CardHeader>
            <CardTitle>Trace (live from Tediware)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!isApiConfigured() && (
              <p className="text-muted-foreground">
                Set TEDIWARE_BASE_URL and TEDIWARE_API_KEY to read the trace.
              </p>
            )}
            {traceError && (
              <FailurePanel
                title="Could not read the trace"
                message={traceError}
              />
            )}
            {trace && <TraceSummary trace={trace} />}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Request payload</CardTitle>
        </CardHeader>
        <CardContent>
          <JsonViewer value={s.requestPayload} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Response</CardTitle>
        </CardHeader>
        <CardContent>
          <JsonViewer value={s.responseBody ?? ""} />
        </CardContent>
      </Card>

      {notifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Delivery notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {notifications.map((n) => (
              <div key={n.id} className="space-y-2">
                <div className="text-sm">
                  <span className="font-medium">
                    {n.role === "outbound" ? "Delivered" : "Error"}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    {formatDateTime(n.receivedAt)}
                  </span>
                </div>
                <JsonViewer value={n.rawResult ?? n.rawWebhookBody} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function TraceSummary({ trace }: { trace: Trace }) {
  const failures = traceFailures(trace)
  return (
    <>
      <Fields
        items={[
          ["Processing", trace.processing ? "still running" : "finished"],
          [
            "Transactions",
            trace.ediTransactions.length
              ? trace.ediTransactions
                  .map((t) => `${t.transactionSetIdentifier} ${t.status}`)
                  .join(", ")
              : "none yet",
          ],
          [
            "Steps",
            trace.results.map((r) => r.nodeName).join(" > ") || "none yet",
          ],
        ]}
      />
      {failures.map((f) => (
        <FailurePanel
          key={`${f.nodeName}-${f.message}`}
          title={`Failed at ${f.nodeName}`}
          message={f.message}
          errors={f.errors}
        />
      ))}
    </>
  )
}
