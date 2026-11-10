import { createHmac, timingSafeEqual } from "node:crypto"

import type { SigningConfig } from "./env"

/**
 * Webhook signature verification.
 *
 * Tediware sends `X-Webhook-Signature: t=<unix seconds>,v1=<hex hmac>`. The
 * signed string is `"{t}.{rawBody}"`, HMAC-SHA256 with the webhook secret. We
 * verify against the raw request bytes before any JSON parsing, compare in
 * constant time, and reject deliveries whose timestamp is outside the tolerance
 * window to resist replay.
 */

export type VerifyResult =
  | { valid: true; timestamp: number }
  | {
      valid: false
      reason: "malformed_header" | "bad_signature" | "stale_timestamp"
    }

/** Builds the digest for a given timestamp and raw body. Shared by verify and the dev signer. */
export function computeSignature(
  timestamp: number,
  rawBody: string,
  secret: string
): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex")
}

function parseHeader(header: string): { t: number; v1: string } | null {
  const parts = header.split(",").map((p) => p.trim())
  let t: number | undefined
  let v1: string | undefined
  for (const part of parts) {
    const eq = part.indexOf("=")
    if (eq === -1) continue
    const key = part.slice(0, eq)
    const value = part.slice(eq + 1)
    if (key === "t") t = Number(value)
    else if (key === "v1") v1 = value
  }
  if (t === undefined || !Number.isFinite(t) || !v1) return null
  return { t, v1 }
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8")
  const bufB = Buffer.from(b, "utf8")
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  config: SigningConfig,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): VerifyResult {
  if (!signatureHeader) return { valid: false, reason: "malformed_header" }

  const parsed = parseHeader(signatureHeader)
  if (!parsed) return { valid: false, reason: "malformed_header" }

  const expected = computeSignature(parsed.t, rawBody, config.secret)
  if (!constantTimeEqual(expected, parsed.v1.toLowerCase())) {
    return { valid: false, reason: "bad_signature" }
  }

  // Signature is valid; now guard against replay of an old delivery.
  if (Math.abs(nowSeconds - parsed.t) > config.toleranceSeconds) {
    return { valid: false, reason: "stale_timestamp" }
  }

  return { valid: true, timestamp: parsed.t }
}

/** Produces the `X-Webhook-Signature` header value for a body. For the dev harness only. */
export function signWebhookBody(
  rawBody: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000)
): string {
  return `t=${timestamp},v1=${computeSignature(timestamp, rawBody, secret)}`
}
