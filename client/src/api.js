async function request(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    // ignore
  }
  if (!res.ok) {
    const err = new Error(body?.error?.message || body?.message || 'حدث خطأ غير متوقع')
    err.code = body?.error?.code
    throw err
  }
  return body?.data ?? body
}

export const api = {
  get: (url) => request(url),
  post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  delete: (url) => request(url, { method: 'DELETE' }),
}