import { Badge } from "@/components/ui/badge"
import type { DeliveryNotification } from "@/db/schema"
import type { Delivery } from "@/lib/queries"
import { cn } from "@/lib/utils"

/** Outcome of an outbound submission: accepted (queued), rejected, error. */
export function OutcomeBadge({
  outcome,
  stubbed,
}: {
  outcome: string
  stubbed?: boolean
}) {
  const label = outcome[0]?.toUpperCase() + outcome.slice(1)
  return (
    <Badge variant={outcome === "accepted" ? "default" : "destructive"}>
      {stubbed ? `${label} (stub)` : label}
    </Badge>
  )
}

const deliveryLabel: Record<Delivery["status"], string> = {
  pending: "Awaiting outcome",
  delivered: "Delivered",
  failed: "Not delivered",
}

/** Whether Tediware got an accepted document to the partner. */
export function DeliveryBadge({ status }: { status: Delivery["status"] }) {
  return (
    <Badge
      variant={status === "failed" ? "destructive" : "outline"}
      className="gap-1.5"
    >
      {status !== "failed" && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            status === "delivered" ? "bg-emerald-500" : "bg-muted-foreground"
          )}
        />
      )}
      {deliveryLabel[status]}
    </Badge>
  )
}

/** Processing status of an inbound delivery. */
export function ReceivedBadge({ status }: { status: string }) {
  return (
    <Badge variant={status === "failed" ? "destructive" : "outline"}>
      {status}
    </Badge>
  )
}

export type FailureSummary = {
  /** The flow step that failed. */
  node: string | null
  message: string
  errors: string[]
}

/** The readable parts of an error notification. */
export function failureSummary(n: DeliveryNotification): FailureSummary {
  let node: string | null = null
  if (n.rawResult) {
    try {
      node = (JSON.parse(n.rawResult) as { nodeName?: string }).nodeName ?? null
    } catch {
      node = null
    }
  }
  let errors: string[] = []
  if (n.errors) {
    try {
      errors = JSON.parse(n.errors) as string[]
    } catch {
      errors = []
    }
  }
  const message =
    n.errorMessage ??
    (n.fetchError
      ? `Tediware reported a failure; its details could not be fetched (${n.fetchError}).`
      : "Tediware reported a failure. Set TEDIWARE_BASE_URL and TEDIWARE_API_KEY to fetch its details.")
  return { node, message, errors }
}

/** A failure message with its individual errors, in a destructive panel. */
export function FailurePanel({
  title,
  message,
  errors = [],
  className,
}: {
  title: string
  message: string
  errors?: string[]
  className?: string
}) {
  return (
    <div
      className={cn(
        "space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm",
        className
      )}
    >
      <div className="font-medium text-destructive">{title}</div>
      <p className="leading-relaxed break-words">{message}</p>
      {errors.length > 0 && (
        <ul className="space-y-1 font-mono text-xs">
          {errors.map((e) => (
            <li key={e} className="break-all">
              {e}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A dashed placeholder for an empty list. */
export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

/** A label/value grid for record metadata. */
export function Fields({
  items,
}: {
  items: [label: string, value: React.ReactNode][]
}) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-all">{value ?? "-"}</dd>
        </div>
      ))}
    </dl>
  )
}
