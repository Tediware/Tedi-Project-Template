import { after } from "next/server"

import {
  enrichNotification,
  recordNotification,
} from "@/lib/delivery-notifications"
import { readWebhook } from "@/lib/tediware"

/**
 * Shared by the outbound and errors routes: verify, record, acknowledge, then
 * fetch the result's details after the response. The error webhook is never
 * retried by Tediware, so recording comes first and nothing slow precedes the
 * 200.
 */
export async function handleNotification(
  request: Request,
  role: "outbound" | "error"
): Promise<Response> {
  const delivery = await readWebhook(request, role)
  if (!delivery.ok) {
    return Response.json({ error: delivery.error }, { status: delivery.status })
  }

  let notificationId
  try {
    notificationId = recordNotification(role, delivery)
  } catch (error) {
    console.error(`[webhook:${role}] recording failed:`, error)
    return Response.json({ error: "record_failed" }, { status: 500 })
  }

  if (notificationId === null) {
    return Response.json({ status: "duplicate" })
  }

  after(() => enrichNotification(notificationId))
  return Response.json({ status: "recorded" })
}
