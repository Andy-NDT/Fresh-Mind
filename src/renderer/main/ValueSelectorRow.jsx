import React from 'react'
import './ValueSelectorRow.css'

const VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export default function ValueSelectorRow({
  value,         // текущее значение (0..10) или null/undefined
  color,         // цвет сферы — подсветка активной кнопки
  onChange,      // (newValue) => void
  onClear,       // () => void — если хочешь убрать оценку (опционально)
  size = 'sm'    // 'sm' для QC-чипа, 'md' для колеса
}) {
  return (
    <div className={`vsr vsr-${size}`} onClick={e => e.stopPropagation()}>
      {VALUES.map(v => {
        const isActive = v === value
        return (
          <button
            key={v}
            type="button"
            className={`vsr-btn ${isActive ? 'on' : ''}`}
            style={isActive ? { background: color, borderColor: color, color: 'white' } : null}
            onClick={() => onChange(v)}
          >
            {v}
          </button>
        )
      })}
      {onClear && value != null && (
        <button
          type="button"
          className="vsr-clear"
          onClick={onClear}
          title="Убрать оценку"
        >×</button>
      )}
    </div>
  )
}
