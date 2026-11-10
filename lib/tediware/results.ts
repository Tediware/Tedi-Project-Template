import fs from "node:fs"
import path from "node:path"

import { apiGetJson, apiRequest, TediwareError } from "./client"
import { isApiConfigured } from "./env"

/**
 * Reading documents back from the platform after a webhook.
 *
 * A webhook only notifies; the document is fetched in two steps.
 * `GET /platform/results/:id` returns metadata whose `detail.artifacts` lists
 * the files that step produced, and `GET /platform/artifacts/:id` downloads
 * one as raw bytes (not a JSON envelope). For an inbound document the JSON to
 * read is the artifact with `usage: "output"` and
 * `contentType: "application/json"`.
 *
 * When the API is not configured, documents are read from local fixtures at
 * `fixtures/results/<id>.json` (the fixture is the document itself), so the
 * whole inbound path runs locally via `npm run webhook:send`.
 */

const FIXTURES_DIR = path.join(process.cwd(), "fixtures", "results")

export type ResultArtifact = {
  id: string
  usage: "input" | "output"
  /** MIME type, e.g. "application/json" or "application/edi-x12". */
  contentType?: string
  filename?: string
}

/** A non-fatal note a processing step raised. Branch on `code`. */
export type ResultWarning = {
  code: string
  message: string
  detail?: Record<string, unknown>
}

export type ResultResponse = {
  id: string
  traceGuid: string
  createdAt: string
  updatedAt: string
  nodeId?: string
  nodeName: string
  status?: "success" | "error"
  detail: {
    /**
     * The step's transfer direction, not the document's: a webhook delivering
     * an inbound document to you records "outbound".
     */
    direction: "inbound" | "outbound"
    errorMessage?: string
    /** Individual validation failures as JSON-pointer messages. */
    errors?: string[]
    /**
     * The mapping ran but its output failed validation against the target
     * implementation. Inbound documents are delivered anyway, so check this
     * before trusting a document.
     */
    mappingFailed?: boolean
    mappingError?: { errors?: string[] }
    warnings?: ResultWarning[]
    /** The partner's stable key. Route on this, not on the ISA sender id. */
    partner?: { key?: string }
    /** ISA15: "T" test or "P" production. Tests reach the same webhook. */
    usageIndicator?: "P" | "T"
    x12?: {
      sender?: { isa?: { qualifier?: string; id?: string } }
      receiver?: { isa?: { qualifier?: string; id?: string } }
      transaction?: {
        transactionSetIdentifier?: string
        controlNumber?: number
      }
      interchange?: { controlNumber?: number }
      functionalGroup?: { controlNumber?: number }
    }
    artifacts?: ResultArtifact[]
  }
}

// Ids arrive in webhook payloads, so they are external input. Constrain them
// before they reach a filesystem path or a URL.
export function safeId(kind: string, id: string | number): string {
  const text = String(id)
  if (!/^[A-Za-z0-9_-]+$/.test(text)) {
    throw new Error(`Refusing ${kind} id with unexpected characters: ${text}`)
  }
  return text
}

export async function fetchResult(
  resultId: string | number
): Promise<ResultResponse> {
  const id = safeId("result", resultId)
  return apiGetJson<ResultResponse>(`/platform/results/${id}`)
}

/** Downloads an artifact's raw file content as text. */
export async function fetchArtifactText(
  artifactId: string | number
): Promise<string> {
  const id = safeId("artifact", artifactId)
  const response = await apiRequest(`/platform/artifacts/${id}`, {
    method: "GET",
  })
  const text = await response.text()
  if (!response.ok) {
    throw new TediwareError(
      `GET /platform/artifacts/${id} returned ${response.status}`,
      response.status,
      text
    )
  }
  return text
}

/**
 * The inbound document for a result: fetches the result, picks the JSON
 * output artifact, and downloads it. Returns both, so the caller can keep an
 * audit copy of what it saw.
 *
 * Unconfigured, the fixture file stands in for the downloaded document and
 * there is no result metadata.
 */
export async function fetchInboundDocument(
  resultId: string | number
): Promise<{ result: ResultResponse | null; document: unknown }> {
  const id = safeId("result", resultId)
  if (!isApiConfigured()) {
    return { result: null, document: readFixture(id) }
  }

  const result = await fetchResult(id)
  const artifacts = result.detail?.artifacts ?? []
  const artifact =
    artifacts.find(
      (a) => a.usage === "output" && a.contentType === "application/json"
    ) ??
    // Older results may omit contentType; fall back to the output artifact.
    artifacts.find((a) => a.usage === "output")
  if (!artifact) {
    throw new Error(
      `Result ${id} has no output artifact to download ` +
        `(artifacts: ${JSON.stringify(artifacts)})`
    )
  }

  const text = await fetchArtifactText(artifact.id)
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    throw new Error(
      `Artifact ${artifact.id} for result ${id} is not valid JSON ` +
        `(contentType ${artifact.contentType ?? "unknown"})`
    )
  }
  return { result, document }
}

function readFixture(id: string): unknown {
  const file = path.join(FIXTURES_DIR, `${id}.json`)
  if (!fs.existsSync(file)) {
    throw new Error(
      `Tediware API not configured and no local fixture for result ${id} ` +
        `(expected ${file}). Set TEDIWARE_BASE_URL and TEDIWARE_API_KEY, ` +
        `or run npm run webhook:send to create one.`
    )
  }
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

/** The transaction set code a result's envelope names, when it names one. */
export function transactionSetOf(result: ResultResponse | null): string | null {
  const code = result?.detail?.x12?.transaction?.transactionSetIdentifier
  return code?.trim() || null
}
