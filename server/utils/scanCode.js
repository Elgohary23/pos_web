/**
 * Normalises whatever a scanner hands us into a product barcode.
 *
 * A phone running its own camera app scans the printed QR and opens the deep
 * link it contains, so the payload that reaches us is frequently a URL rather
 * than a bare code. Raw codes must keep working too, because the desktop
 * scanner still reads the Code128 on the same label. Both are accepted:
 *
 *   8F3A2B                              -> 8F3A2B   (Code128, desktop scanner)
 *   http://192.168.1.5:3000/l/8F3A2B    -> 8F3A2B   (printed QR, phone camera)
 *   http://192.168.1.5:3000/l?code=...  -> 8F3A2B
 *   kasabi://product/8F3A2B             -> 8F3A2B
 *
 * Returns '' when the payload is not one of ours, so callers can report a
 * clean "unknown code" instead of querying the database with a whole URL.
 */

// Products carry a 12-char hex barcode, but other suppliers' labels can hold
// anything printable, so the accepted alphabet is deliberately wider.
const RAW_CODE = /^[A-Za-z0-9_-]{1,64}$/
const MAX_PAYLOAD = 2048
const DEEP_LINK_PREFIX = '/l/'

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

  // A custom scheme such as kasabi://product/8F3A2B parses with an empty
  // pathname, so fall back to the last non-empty path segment.
  const segments = path.split('/').filter(Boolean)
  if (!segments.length) return ''
  const last = safeDecode(segments[segments.length - 1]).trim()
  return RAW_CODE.test(last) ? last : ''
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function extractScanCode(input) {
  if (input === null || input === undefined) return ''
  const value = String(input).trim()
  if (!value || value.length > MAX_PAYLOAD) return ''
  if (value.includes('://') || value.startsWith('kasabi:')) return fromUrl(value)
  return RAW_CODE.test(value) ? value : ''
}

export const SCAN_CODE_PATTERN = RAW_CODE
