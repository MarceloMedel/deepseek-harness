/** Header lookup shared by the trust fence and the Access verifier. */
import { describe, expect, it } from 'vitest'
import { requestHeader } from '../src/request-headers.ts'

describe('request header lookup', () => {
  it('reads the same header from a Fetch Headers or a Node header map', () => {
    expect(requestHeader(new Headers({ Host: 'harness.example' }), 'host')).toBe('harness.example')
    expect(requestHeader({ host: 'harness.example' }, 'host')).toBe('harness.example')
  })

  it('reports an absent or multi-valued header as undefined', () => {
    expect(requestHeader(new Headers(), 'host')).toBeUndefined()
    expect(requestHeader({}, 'host')).toBeUndefined()
    // node:http types a repeated header as an array; the fence reads single values only.
    expect(requestHeader({ cookie: ['a', 'b'] }, 'cookie')).toBeUndefined()
  })
})
