import React, { useEffect, useState } from 'react'
import './OnThisDay.css'

function todayISOLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fullDateLabel(ts) {
  const d = new Date(ts)
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
  const now = new Date()
  const yearsAgo = now.getFullYear() - d.getFullYear()
  const suffix = yearsAgo === 1 ? '1 год назад' : (yearsAgo > 1 ? `${yearsAgo} ${pluralYears(yearsAgo)} назад` : '')
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}${suffix ? ' · ' + suffix : ''}`
}

function pluralYears(n) {
  const mod10 = n % 10, mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'год'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'года'
  return 'лет'
}

function pluralEntries(n) {
  const mod10 = n % 10, mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'запись'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'записи'
  return 'записей'
}

function previewFromText(text, maxChars = 180) {
  if (!text) return ''
  const cleaned = text.trim().replace(/\s+/g, ' ')
  if (cleaned.length <= maxChars) return cleaned
  return cleaned.slice(0, maxChars - 1).trimEnd() + '…'
}

export default function OnThisDay({ refreshKey = 0 }) {
  const [entries, setEntries] = useState(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const todayISO = todayISOLocal()
    window.freshMind.getOnThisDay(todayISO).then(rows => setEntries(rows || []))
  }, [refreshKey])

  // Не рендерим вообще, пока загружается или если нет записей
  if (!entries || entries.length === 0) return null

  return (
    <div className={`otd-block ${expanded ? 'is-expanded' : ''}`}>
      <button className="otd-toggle" onClick={() => setExpanded(v => !v)} title={expanded ? 'Свернуть' : 'Показать записи прошлых лет'}>
        <span className="otd-spark" aria-hidden>✨</span>
        <span className="otd-text">
          В этот день · {entries.length} {pluralEntries(entries.length)} из прошлого
        </span>
        <svg
          className="otd-chevron"
          width="10" height="10" viewBox="0 0 10 10"
          style={{ transform: expanded ? 'rotate(180deg)' : '' }}
        >
          <path d="M2.5 3.5L5 6l2.5-2.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {expanded && (
        <div className="otd-list">
          {entries.map(e => (
            <div key={e.id} className="otd-card">
              <div className="otd-card-meta">
                <span className="otd-date">{fullDateLabel(e.created_at)}</span>
                {e.mood_emoji && <span className="otd-mood">{e.mood_emoji}</span>}
                {e.pinned && (
                  <span className="otd-pin" title="Памятка">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2z"/></svg>
                  </span>
                )}
              </div>
              {e.spheres && e.spheres.length > 0 && (
                <div className="otd-spheres">
                  {e.spheres.map(s => (
                    <span key={s.id} className="otd-sphere-chip" style={{ borderColor: s.color, background: s.color + '22' }}>
                      <span className="otd-sphere-dot" style={{ background: s.color }} />
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="otd-text-body">{previewFromText(e.content_text || '') || <em>пусто</em>}</div>
              {e.tags && e.tags.length > 0 && (
                <div className="otd-tags">{e.tags.map(t => `#${t}`).join(' ')}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
