import "server-only"

import { eq } from "drizzle-orm"

import { db, schema } from "@/db"
import { fetchResult, isApiConfigured } from "@/lib/tediware"

/**
 * Delivery notifications for outbound documents. Submitting only queues a
 * document; Tediware reports the outcome later, on the partner's outbound
 * webhook when it was delivered and on its error webhook when a step failed.
 * Both send the same body, so each role has its own route and the route is
 * what says delivered or failed. The trace GUID joins a notification to the
 * submission that started the trace.
 */

/** Inserts the notification, idempotent on result id. Null for a duplicate. */
export function recordNotification(
  role: "outbound" | "error",
  delivery: {
    resultExtid: string
    traceGuid: string | null
    requestId: string | null
    rawBody: string
  }
): number | null {
  const [inserted] = db
    .insert(schema.deliveryNotifications)
    .values({
      role,
      resultExtid: delivery.resultExtid,
      traceGuid: delivery.traceGuid,
      requestId: delivery.requestId,
      rawWebhookBody: delivery.rawBody,
    })
    .onConflictDoNothing({ target: schema.deliveryNotifications.resultExtid })
    .returning({ id: schema.deliveryNotifications.id })
    .all()
  return inserted?.id ?? null
}

/**
 * Fetches the result a notification points at, for its error message and
 * individual validation errors. Never throws; a failed fetch is recorded on
 * the row. Without API config there is nothing to fetch, and the role alone
 * says delivered or failed.
 */
export async function enrichNotification(notificationId: number) {
  if (!isApiConfigured()) return
  const row = db
    .select()
    .from(schema.deliveryNotifications)
    .where(eq(schema.deliveryNotifications.id, notificationId))
    .get()
  if (!row) return

  try {
    const result = await fetchResult(row.resultExtid)
    const errors = result.detail?.errors ?? []
    db.update(schema.deliveryNotifications)
      .set({
        rawResult: JSON.stringify(result, null, 2),
        errorMessage: result.detail?.errorMessage ?? null,
        errors: errors.length > 0 ? JSON.stringify(errors) : null,
        fetchError: null,
      })
      .where(eq(schema.deliveryNotifications.id, notificationId))
      .run()
  } catch (error) {
    const fetchError = (error as Error).message
    console.error(
      `[webhook:${row.role}] fetching result ${row.resultExtid} failed:`,
      fetchError
    )
    db.update(schema.deliveryNotifications)
      .set({ fetchError })
      .where(eq(schema.deliveryNotifications.id, notificationId))
      .run()
  }
}
