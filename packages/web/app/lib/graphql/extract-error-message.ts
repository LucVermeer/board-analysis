// graphql-request throws ClientError-shaped errors with a `response.errors[]`
// array. We trust those messages because they come from our own resolvers
// (zod errors, explicit throws like "You already have a board with this
// configuration"). Anything else — fetch failures, library bugs,
// `error.message` — is opaque, so callers should fall back to a generic
// message and we never leak internal strings.
export function extractGraphQLErrorMessage(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  if (!('response' in error)) return null;
  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== 'object' || !('errors' in response)) return null;
  const errors = (response as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = errors[0];
  if (!first || typeof first !== 'object' || !('message' in first)) return null;
  const message = (first as { message?: unknown }).message;
  return typeof message === 'string' && message.length > 0 ? message : null;
}
