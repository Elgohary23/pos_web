/**
 * Client-side mirror of server/utils/scanCode.js.
 *
 * A printed label carries two symbols: a Code128 holding the raw barcode (read
 * by the in-app desktop scanner) and a QR holding the deep link (opened by the
 * phone's own camera app). Both must resolve to the same product, so every scan
 * result is normalised here before it is looked up.
 *
 * Returns '' when the payload is not one of ours.
 */

const RAW_CODE = /^[A-Za-z0-9_-]{1,64}$/
const MAX_PAYLOAD = 2048
const DEEP_LINK_PREFIX = '/l/'

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function fromUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    return ''
  }

  const queryCode = url.searchParams.get('code') || url.searchParams.get('barcode')
  if (queryCode) return RAW_CODE.test(queryCode.trim()) ? queryCode.trim() : ''

  const path = url.pathname || ''
  const marker = path.indexOf(DEEP_LINK_PREFIX)
  if (marker !== -1) {
    const tail = path.slice(marker + DEEP_LINK_PREFIX.length).split('/')[0]
    const decoded = safeDecode(tail).trim()
    return RAW_CODE.test(decoded) ? decoded : ''
  }

  const segments = path.split('/').filter(Boolean)
  if (!segments.length) return ''
  const last = safeDecode(segments[segments.length - 1]).trim()
  return RAW_CODE.test(last) ? last : ''
}

export function extractScanCode(input) {
  if (input === null || input === undefined) return ''
  const value = String(input).trim()
  if (!value || value.length > MAX_PAYLOAD) return ''
  if (value.includes('://') || value.startsWith('kasabi:')) return fromUrl(value)
  return RAW_CODE.test(value) ? value : ''
}
