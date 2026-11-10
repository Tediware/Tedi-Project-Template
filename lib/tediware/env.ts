/**
 * Tediware configuration, read from the environment.
 *
 * Config is validated per capability, not all-or-nothing, so the app runs
 * with nothing configured: verifying webhook signatures needs only a webhook
 * secret, and everything that calls the platform API needs the base URL and
 * API key. Each getter fails loudly and names exactly what is missing when the
 * capability it guards is used without its config.
 */

export type ApiConfig = { baseUrl: string; apiKey: string }
export type SigningConfig = { secret: string; toleranceSeconds: number }

/**
 * The role a webhook plays. Tediware sends the outbound (delivered) and error
 * notifications with the same body, so the app gives each role its own URL
 * and tells them apart by route.
 */
export type WebhookRole = "inbound" | "outbound" | "error"

const DEFAULT_TOLERANCE_SECONDS = 300

const roleSecretVar: Record<WebhookRole, string | null> = {
  inbound: null,
  outbound: "TEDIWARE_OUTBOUND_WEBHOOK_SECRET",
  error: "TEDIWARE_ERROR_WEBHOOK_SECRET",
}

function read(name: string): string | undefined {
  const value = process.env[name]
  return value && value.trim() !== "" ? value.trim() : undefined
}

function missingError(names: string[]): Error {
  return new Error(
    `Tediware is not configured: missing ${names.join(", ")}. ` +
      `Set these in .env.local (see .env.example).`
  )
}

/** True when the platform API is usable (base URL and API key are set). */
export function isApiConfigured(): boolean {
  return !!read("TEDIWARE_BASE_URL") && !!read("TEDIWARE_API_KEY")
}

/** Base URL and API key for the platform API. Throws if either is unset. */
export function getApiConfig(): ApiConfig {
  const baseUrl = read("TEDIWARE_BASE_URL")
  const apiKey = read("TEDIWARE_API_KEY")
  const missing: string[] = []
  if (!baseUrl) missing.push("TEDIWARE_BASE_URL")
  if (!apiKey) missing.push("TEDIWARE_API_KEY")
  if (missing.length) throw missingError(missing)
  return { baseUrl: baseUrl!.replace(/\/+$/, ""), apiKey: apiKey! }
}

/**
 * Signing secret and replay tolerance for one webhook role. The outbound and
 * error roles read a role-specific variable and fall back to
 * TEDIWARE_WEBHOOK_SECRET, for when one Tediware webhook serves several roles.
 * Throws if no secret is set.
 */
export function getSigningConfig(role: WebhookRole = "inbound"): SigningConfig {
  const roleVar = roleSecretVar[role]
  const secret =
    (roleVar ? read(roleVar) : undefined) ?? read("TEDIWARE_WEBHOOK_SECRET")
  if (!secret) {
    throw missingError(
      roleVar
        ? [roleVar, "TEDIWARE_WEBHOOK_SECRET"]
        : ["TEDIWARE_WEBHOOK_SECRET"]
    )
  }
  const raw = read("TEDIWARE_WEBHOOK_TOLERANCE_SECONDS")
  const toleranceSeconds = raw ? Number(raw) : DEFAULT_TOLERANCE_SECONDS
  return {
    secret,
    toleranceSeconds: Number.isFinite(toleranceSeconds)
      ? toleranceSeconds
      : DEFAULT_TOLERANCE_SECONDS,
  }
}

/** A human-readable summary of what is configured, for the startup log. */
export function describeConfig(): { live: boolean; lines: string[] } {
  const verifies = (role: WebhookRole) => {
    const roleVar = roleSecretVar[role]
    return !!(roleVar && read(roleVar)) || !!read("TEDIWARE_WEBHOOK_SECRET")
  }
  const api = isApiConfigured()

  const lines = [
    `platform API: ${api ? `live (${read("TEDIWARE_BASE_URL")})` : "not configured (set TEDIWARE_BASE_URL + TEDIWARE_API_KEY)"}`,
    `inbound webhook: ${verifies("inbound") ? "verifying signatures" : "disabled (set TEDIWARE_WEBHOOK_SECRET)"}`,
    `outbound/error webhooks: outbound ${verifies("outbound") ? "enabled" : "disabled"}, error ${verifies("error") ? "enabled" : "disabled"}`,
    `inbound document fetch: ${api ? "live" : "local fixtures under fixtures/results/"}`,
    `outbound submission: ${api ? "live" : "stubbed as accepted"}`,
  ]
  return { live: api, lines }
}
