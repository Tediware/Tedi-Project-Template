import Link from "next/link"

import {
  DeliveryBadge,
  Empty,
  OutcomeBadge,
  ReceivedBadge,
  failureSummary,
} from "@/components/status"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDateTime } from "@/lib/format"
import { getActivity } from "@/lib/queries"

// Reads live DB state; never serve a build-time snapshot.
export const dynamic = "force-dynamic"

const rowLink = "after:absolute after:inset-0"

export default function ActivityPage() {
  const { received, submissions, unmatchedErrors } = getActivity()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Every document received from or sent to Tediware, newest first.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Inbound deliveries</h2>
        {received.length === 0 ? (
          <Empty>
            Nothing received yet. Deliveries appear here when Tediware calls the
            inbound webhook. Try <code>npm run webhook:send</code>.
          </Empty>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Set</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {received.map((d) => (
                  <TableRow key={d.id} className="relative hover:bg-muted/50">
                    <TableCell className="text-muted-foreground">
                      <Link href={`/inbound/${d.id}`} className={rowLink}>
                        {formatDateTime(d.receivedAt)}
                      </Link>
                    </TableCell>
                    <TableCell>{d.partner ?? "-"}</TableCell>
                    <TableCell>{d.transactionSet ?? "-"}</TableCell>
                    <TableCell className="font-medium">
                      {d.reference ?? "-"}
                    </TableCell>
                    <TableCell>
                      <ReceivedBadge status={d.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Outbound submissions</h2>
        {submissions.length === 0 ? (
          <Empty>
            Nothing sent yet.{" "}
            <Link href="/send" className="underline underline-offset-4">
              Send a document
            </Link>{" "}
            to a partner.
          </Empty>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Set</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Delivery</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.map(({ submission: s, delivery }) => (
                  <TableRow key={s.id} className="relative hover:bg-muted/50">
                    <TableCell className="text-muted-foreground">
                      <Link href={`/submissions/${s.id}`} className={rowLink}>
                        {formatDateTime(s.submittedAt)}
                      </Link>
                    </TableCell>
                    <TableCell>{s.partner}</TableCell>
                    <TableCell>
                      {s.tsCode}
                      {s.usageIndicator === "T" && (
                        <span className="text-muted-foreground"> (test)</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <OutcomeBadge outcome={s.outcome} stubbed={s.stubbed} />
                    </TableCell>
                    <TableCell>
                      {delivery ? (
                        <DeliveryBadge status={delivery.status} />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {unmatchedErrors.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Other flow errors</h2>
          <p className="text-sm text-muted-foreground">
            Error notifications that match no submission from this app, such as
            an inbound document failing inside Tediware.
          </p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Received</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Trace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unmatchedErrors.map((n) => {
                  const failure = failureSummary(n)
                  const text = [failure.message, ...failure.errors].join(" ")
                  return (
                    <TableRow key={n.id}>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(n.receivedAt)}
                      </TableCell>
                      <TableCell>{failure.node ?? "-"}</TableCell>
                      <TableCell className="max-w-md">
                        <span
                          className="block truncate text-muted-foreground"
                          title={text}
                        >
                          {text}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {n.traceGuid ?? "-"}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  )
}
