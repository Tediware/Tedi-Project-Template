import { handleNotification } from "../notification-route"

/** Outbound webhook: Tediware delivered a document to the partner. */
export async function POST(request: Request): Promise<Response> {
  return handleNotification(request, "outbound")
}
