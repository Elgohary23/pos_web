import { useEffect, useMemo, useRef, useState } from 'react'

export default function AutocompleteInput({
  value,
  onChange,
  options = [],
  placeholder,
  disabled,
  onSelect,
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(-1)
  const wrapRef = useRef(null)

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.name.toLowerCase().includes(q))
  }, [value, options])

  const selectItem = (item) => {
    onChange(item.name)
    setOpen(false)
    onSelect?.(item)
  }

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      if (highlight >= 0 && filtered[highlight]) {
        e.preventDefault()
        selectItem(filtered[highlight])
      } else {
        setOpen(false)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  useEffect(() => {
    const onClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div className="autocomplete-wrap" ref={wrapRef}>
      <input
        type="text"
        className="autocomplete-input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="autocomplete-list">
          {filtered.map((item, i) => (
            <li
              key={item.id ?? item.name}
              className={i === highlight ? 'autocomplete-item active' : 'autocomplete-item'}
              onMouseDown={() => selectItem(item)}
            >
              {item.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}