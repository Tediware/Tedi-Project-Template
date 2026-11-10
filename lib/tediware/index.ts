/**
 * The one module that talks to Tediware. Route handlers, server actions and
 * scripts call it; nothing else issues fetches against Tediware URLs. Keep the
 * surface small and plain: no retry frameworks, no queues.
 */
export {
  describeConfig,
  getApiConfig,
  getSigningConfig,
  isApiConfigured,
  type ApiConfig,
  type SigningConfig,
  type WebhookRole,
} from "./env"
export { errorMessageFromBody, TediwareError } from "./client"
export {
  computeSignature,
  signWebhookBody,
  verifyWebhookSignature,
  type VerifyResult,
} from "./signature"
export {
  readWebhook,
  type ReadWebhookResult,
  type WebhookNotification,
} from "./webhook"
export {
  fetchArtifactText,
  fetchInboundDocument,
  fetchResult,
  transactionSetOf,
  type ResultArtifact,
  type ResultResponse,
  type ResultWarning,
} from "./results"
export {
  submitTransaction,
  type SubmitOptions,
  type SubmitResult,
} from "./submit"
export {
  listEdiTransactionsForTrace,
  resendEdiTransaction,
  type EdiTransaction,
  type ResendResult,
} from "./edi-transactions"
export { listPartners, type PartnerSummary } from "./partners"
export { fetchTrace, traceFailures, type Trace } from "./traces"
