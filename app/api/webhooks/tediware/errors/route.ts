import { handleNotification } from "../notification-route"

/** Error webhook: a step in one of the partner's flows failed. */
export async function POST(request: Request): Promise<Response> {
  return handleNotification(request, "error")
}
