import { ArrowLeftIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ActionButton } from "@/components/action-button"
import { JsonViewer } from "@/components/json-viewer"
import { FailurePanel, Fields, ReceivedBadge } from "@/components/status"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDateTime } from "@/lib/format"
import { getReceivedDocument } from "@/lib/queries"
import { reprocess } from "./actions"

export const dynamic = "force-dynamic"

export default async function InboundPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const d = getReceivedDocument(Number(id))
  if (!d) notFound()

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
            {[d.transactionSet, d.reference].filter(Boolean).join(" ") ||
              "Inbound delivery"}
            {d.partner && ` from ${d.partner}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            Received {formatDateTime(d.receivedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ReceivedBadge status={d.status} />
          {d.status !== "processed" && (
            <ActionButton
              action={reprocess.bind(null, d.id)}
              label="Reprocess"
              pendingLabel="Processing..."
            />
          )}
        </div>
      </div>

      {d.error && <FailurePanel title="Processing failed" message={d.error} />}

      <Card>
        <CardHeader>
          <CardTitle>Delivery</CardTitle>
        </CardHeader>
        <CardContent>
          <Fields
            items={[
              ["Result", <code key="r">{d.resultExtid}</code>],
              ["Trace", <code key="t">{d.traceGuid ?? "-"}</code>],
              ["Request", <code key="q">{d.requestId ?? "-"}</code>],
              ["Processed", formatDateTime(d.processedAt)],
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Document</CardTitle>
        </CardHeader>
        <CardContent>
          {d.rawDocument ? (
            <JsonViewer value={d.rawDocument} />
          ) : (
            <p className="text-sm text-muted-foreground">Not fetched.</p>
          )}
        </CardContent>
      </Card>

      {d.rawResult && (
        <Card>
          <CardHeader>
            <CardTitle>Result metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonViewer value={d.rawResult} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Webhook body</CardTitle>
        </CardHeader>
        <CardContent>
          <JsonViewer value={d.rawWebhookBody} />
        </CardContent>
      </Card>
    </div>
  )
}
