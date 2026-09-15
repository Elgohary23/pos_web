export default function MoneyInput({ value, onChange, placeholder, disabled }) {
  const handleChange = (e) => {
    let v = e.target.value.replace(/[^\d.]/g, '')
    const firstDot = v.indexOf('.')
    if (firstDot !== -1) {
      const head = v.slice(0, firstDot)
      const tail = v.slice(firstDot + 1).replace(/\./g, '')
      v = head + '.' + tail.slice(0, 2)
    }
    onChange(v)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className="money-input"
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="off"
    />
  )
}