import Decimal from 'decimal.js'

Decimal.set({ precision: 30 })

export function money(value) {
  return new Decimal(Number.isFinite(Number(value)) ? Number(value) : 0)
}

export function round2(value) {
  return money(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber()
}

export function times(a, b) {
  return money(a).times(money(b))
}

export function plus(a, b) {
  return money(a).plus(money(b))
}

export function minus(a, b) {
  return money(a).minus(money(b))
}

export function formatMoney(value) {
  return money(value).toFixed(2)
}