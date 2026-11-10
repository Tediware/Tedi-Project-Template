import { sql } from "drizzle-orm"
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

/**
 * SQLite schema (Drizzle).
 *
 * These three tables are the integration's audit log: every document that
 * crossed the wire, in either direction, with the raw JSON as sent or
 * received. Add your own domain tables beside them and link back to these
 * rows rather than copying payloads.
 *
 * Convention: columns holding a Tediware-side identifier use the `_extid`
 * suffix, never `_id`, so foreign ids stay visually distinct from local
 * autoincrement ids. Timestamps are ISO strings.
 */

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`

/**
 * Inbound webhook deliveries and the documents fetched for them. The unique
 * index on `result_extid` makes delivery idempotent: Tediware's redeliveries
 * carry a new request id but the same result id.
 */
export const receivedDocuments = sqliteTable(
  "received_documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    resultExtid: text("result_extid").notNull(),
    traceGuid: text("trace_guid"),
    requestId: text("request_id"),
    rawWebhookBody: text("raw_webhook_body").notNull(),
    // The result metadata and downloaded document, once fetched.
    rawResult: text("raw_result"),
    rawDocument: text("raw_document"),
    partner: text("partner"),
    transactionSet: text("transaction_set"),
    // What your handler says this document is, e.g. a PO number.
    reference: text("reference"),
    status: text("status", { enum: ["received", "processed", "failed"] })
      .notNull()
      .default("received"),
    error: text("error"),
    receivedAt: text("received_at").notNull().default(now),
    processedAt: text("processed_at"),
  },
  (t) => [uniqueIndex("received_documents_result_extid_unq").on(t.resultExtid)]
)

/**
 * Every outbound POST to Tediware: the request payload as sent and the raw
 * response, whatever the outcome.
 */
export const outboundSubmissions = sqliteTable("outbound_submissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partner: text("partner").notNull(),
  tsCode: text("ts_code").notNull(),
  usageIndicator: text("usage_indicator", { enum: ["P", "T"] }),
  requestPayload: text("request_payload").notNull(),
  responseStatus: integer("response_status"),
  responseBody: text("response_body"),
  // How Tediware answered: accepted (queued), rejected on request validation,
  // or a transport error. Delivery itself is reported later.
  outcome: text("outcome", {
    enum: ["accepted", "rejected", "error"],
  }).notNull(),
  // True when Tediware was not configured and nothing was sent.
  stubbed: integer("stubbed", { mode: "boolean" }).notNull().default(false),
  // Links this submission to its processing results and delivery notifications.
  traceGuid: text("trace_guid"),
  ediTransactionExtid: text("edi_transaction_extid"),
  submittedAt: text("submitted_at").notNull().default(now),
})

/**
 * Notifications from the outbound (delivered) and error webhooks. Rows join
 * to outbound_submissions by trace_guid. Error notifications for inbound
 * flows land here too, with no submission to join to.
 */
export const deliveryNotifications = sqliteTable(
  "delivery_notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Which webhook it arrived on: outbound means delivered, error means failed.
    role: text("role", { enum: ["outbound", "error"] }).notNull(),
    resultExtid: text("result_extid").notNull(),
    traceGuid: text("trace_guid"),
    requestId: text("request_id"),
    rawWebhookBody: text("raw_webhook_body").notNull(),
    // The result the notification points at, as fetched from Tediware.
    rawResult: text("raw_result"),
    errorMessage: text("error_message"),
    // JSON array of individual validation errors, when the result lists them.
    errors: text("errors"),
    // Why the result could not be fetched, if it could not.
    fetchError: text("fetch_error"),
    receivedAt: text("received_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("delivery_notifications_result_extid_unq").on(t.resultExtid),
  ]
)

export type ReceivedDocument = typeof receivedDocuments.$inferSelect
export type OutboundSubmission = typeof outboundSubmissions.$inferSelect
export type DeliveryNotification = typeof deliveryNotifications.$inferSelect
