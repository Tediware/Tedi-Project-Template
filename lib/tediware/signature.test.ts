import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  computeSignature,
  signWebhookBody,
  verifyWebhookSignature,
} from "./signature"

// A fixed worked example: if your own implementation in another language
// produces this digest for these inputs, it signs the way Tediware does.
const secret = "whsec_test"
const timestamp = 1767225600 // 2026-01-01T00:00:00Z
const body = JSON.stringify({
  timestamp: "2026-01-01T00:00:00Z",
  output: { resultId: "r_1", traceGuid: "t_1" },
})
const digest =
  "0660b58001ddc4c5bb812838c4e8cbeef7519c7225bf53c58c17f164cfe6bf07"
const config = { secret, toleranceSeconds: 300 }

describe("webhook signatures", () => {
  it("signs HMAC-SHA256 over `{t}.{rawBody}`", () => {
    assert.equal(computeSignature(timestamp, body, secret), digest)
  })

  it("accepts a valid header within the tolerance window", () => {
    const header = `t=${timestamp},v1=${digest}`
    assert.deepEqual(
      verifyWebhookSignature(body, header, config, timestamp + 60),
      { valid: true, timestamp }
    )
  })

  it("round-trips through signWebhookBody", () => {
    const now = Math.floor(Date.now() / 1000)
    const header = signWebhookBody(body, secret, now)
    assert.equal(verifyWebhookSignature(body, header, config, now).valid, true)
  })

  it("rejects a body that changed by one byte", () => {
    const header = `t=${timestamp},v1=${digest}`
    const result = verifyWebhookSignature(
      body.replace("r_1", "r_2"),
      header,
      config,
      timestamp
    )
    assert.deepEqual(result, { valid: false, reason: "bad_signature" })
  })

  it("rejects the wrong secret", () => {
    const header = `t=${timestamp},v1=${digest}`
    const result = verifyWebhookSignature(
      body,
      header,
      { ...config, secret: "other" },
      timestamp
    )
    assert.deepEqual(result, { valid: false, reason: "bad_signature" })
  })

  it("rejects a stale timestamp even with a valid signature", () => {
    const header = `t=${timestamp},v1=${digest}`
    const result = verifyWebhookSignature(body, header, config, timestamp + 301)
    assert.deepEqual(result, { valid: false, reason: "stale_timestamp" })
  })

  it("rejects a missing or malformed header", () => {
    for (const header of [null, "", "v1=abc", `t=${timestamp}`, "garbage"]) {
      assert.deepEqual(
        verifyWebhookSignature(body, header, config, timestamp),
        {
          valid: false,
          reason: "malformed_header",
        }
      )
    }
  })
})
