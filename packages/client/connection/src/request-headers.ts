/**
 * Header lookup shared by the `/api` trust fence and the Cloudflare Access
 * verifier. Both decide on the same facts from either representation the
 * transport produces: a Node `IncomingMessage` on the route, and the Fetch
 * `Request` the bridge builds from it.
 */

import type { IncomingHttpHeaders } from 'node:http'

/** Request headers from either HTTP representation the fence accepts. */
export type RequestHeaders = IncomingHttpHeaders | Headers

/**
 * Read one header from a Node or Fetch header set.
 * @param headers - request headers in either representation.
 * @param name - case-insensitive header name.
 * @returns the header value, or undefined when absent or not a single string.
 */
export function requestHeader(headers: RequestHeaders, name: string): string | undefined {
  if (headers instanceof Headers) return headers.get(name) ?? undefined
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}
