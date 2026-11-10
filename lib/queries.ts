import "server-only"

import { desc, eq, inArray } from "drizzle-orm"

import { db, schema } from "@/db"
import type {
  DeliveryNotification,
  OutboundSubmission,
  ReceivedDocument,
} from "@/db/schema"

/**
 * Where an accepted submission stands after Tediware queued it: delivered or
 * failed once a notification arrived on its trace, pending until then. The
 * latest notification wins, so a failure followed by a successful resend
 * reads as delivered.
 */
export type Delivery = {
  status: "pending" | "delivered" | "failed"
  notification: DeliveryNotification | null
}

function notificationsByTrace(
  traces: string[]
): Map<string, DeliveryNotification[]> {
  const byTrace = new Map<string, DeliveryNotification[]>()
  if (traces.length === 0) return byTrace
  const rows = db
    .select()
    .from(schema.deliveryNotifications)
    .where(inArray(schema.deliveryNotifications.traceGuid, traces))
    .orderBy(schema.deliveryNotifications.id)
    .all()
  for (const row of rows) {
    const list = byTrace.get(row.traceGuid!) ?? []
    list.push(row)
    byTrace.set(row.traceGuid!, list)
  }
  return byTrace
}

function deliveryOf(
  submission: OutboundSubmission,
  notifications: DeliveryNotification[]
): Delivery | null {
  if (submission.outcome !== "accepted" || !submission.traceGuid) return null
  const latest = notifications.at(-1) ?? null
  return {
    status: !latest
      ? "pending"
      : latest.role === "error"
        ? "failed"
        : "delivered",
    notification: latest,
  }
}

export type ActivityFeed = {
  received: ReceivedDocument[]
  submissions: { submission: OutboundSubmission; delivery: Delivery | null }[]
  /** Error notifications that match no submission, e.g. an inbound flow failing. */
  unmatchedErrors: DeliveryNotification[]
}

/** Inbound deliveries, outbound submissions and stray errors, newest first. */
export function getActivity(limit = 100): ActivityFeed {
  const received = db
    .select()
    .from(schema.receivedDocuments)
    .orderBy(desc(schema.receivedDocuments.id))
    .limit(limit)
    .all()
  const submissions = db
    .select()
    .from(schema.outboundSubmissions)
    .orderBy(desc(schema.outboundSubmissions.id))
    .limit(limit)
    .all()

  const traces = submissions
    .map((s) => s.traceGuid)
    .filter((t): t is string => !!t)
  const byTrace = notificationsByTrace(traces)
  const knownTraces = new Set(traces)

  const unmatchedErrors = db
    .select()
    .from(schema.deliveryNotifications)
    .where(eq(schema.deliveryNotifications.role, "error"))
    .orderBy(desc(schema.deliveryNotifications.id))
    .limit(limit)
    .all()
    .filter((n) => !n.traceGuid || !knownTraces.has(n.traceGuid))

  return {
    received,
    submissions: submissions.map((submission) => ({
      submission,
      delivery: deliveryOf(
        submission,
        byTrace.get(submission.traceGuid ?? "") ?? []
      ),
    })),
    unmatchedErrors,
  }
}

export function getReceivedDocument(id: number): ReceivedDocument | null {
  return (
    db
      .select()
      .from(schema.receivedDocuments)
      .where(eq(schema.receivedDocuments.id, id))
      .get() ?? null
  )
}

export type SubmissionDetail = {
  submission: OutboundSubmission
  delivery: Delivery | null
  /** Every notification on the submission's trace, oldest first. */
  notifications: DeliveryNotification[]
}

export function getSubmissionDetail(id: number): SubmissionDetail | null {
  const submission = db
    .select()
    .from(schema.outboundSubmissions)
    .where(eq(schema.outboundSubmissions.id, id))
    .get()
  if (!submission) return null
  const notifications = submission.traceGuid
    ? (notificationsByTrace([submission.traceGuid]).get(submission.traceGuid) ??
      [])
    : []
  return {
    submission,
    delivery: deliveryOf(submission, notifications),
    notifications,
  }
}
