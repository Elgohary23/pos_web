export default function IntInput({ value, onChange, placeholder, disabled, min = 1 }) {
  const handleChange = (e) => {
    onChange(e.target.value.replace(/\D/g, ''))
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className="int-input"
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete="off"
      aria-label={'الكمية (الحد الأدنى ' + min + ')'}
    />
  )
}