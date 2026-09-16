export function to12(hhmm) {
  if (!hhmm || hhmm === '') return { hour: '9', minute: '00', period: 'AM' }
  const [h, m] = hhmm.split(':').map(Number)
  return {
    hour: String(h % 12 === 0 ? 12 : h % 12),
    minute: String(m).padStart(2, '0'),
    period: h >= 12 ? 'PM' : 'AM',
  }
}

export function to24({ hour, minute, period }) {
  if (!hour || !minute || !period) return null
  let h = Number(hour) % 12
  if (period === 'PM') h += 12
  return `${String(h).padStart(2, '0')}:${minute}`
}

export function formatShift12(hhmm) {
  if (!hhmm) return '—'
  const { hour, minute, period } = to12(hhmm)
  return `${hour}:${minute} ${period}`
}

export function toAr(hhmm) {
  if (!hhmm || hhmm === '') return null
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'م' : 'ص'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${period}`
}

export function formatShiftAr(hhmm) {
  const t = toAr(hhmm)
  return t || '—'
}

export function formatDateTimeAr(createdAt) {
  if (!createdAt) return '—'
  const [datePart, timePart] = String(createdAt).split(' ')
  if (!datePart) return '—'
  const [y, m, d] = datePart.split('-')
  return `${d}/${m}/${y}${timePart ? `، ${timePart.slice(0, 5)}` : ''}`
}