async function request(url, options = {}) {
  const headers = {}
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const res = await fetch(url, {
    credentials: 'include',
    headers,
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

async function download(url) {
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    let body = null
    try {
      body = await res.json()
    } catch {
      // ignore
    }
    const err = new Error(body?.error?.message || body?.message || 'تعذر تنزيل الملف')
    err.code = body?.error?.code
    throw err
  }
  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') || ''
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
  let filename = 'backup.sqlite'
  if (match && match[1]) {
    try {
      filename = decodeURIComponent(match[1].trim())
    } catch {
      filename = match[1].trim()
    }
  }
  return { blob, filename }
}

export const api = {
  get: (url) => request(url),
  post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  delete: (url) => request(url, { method: 'DELETE' }),
  upload: (url, method, formData) => request(url, { method, body: formData }),
  download,
}