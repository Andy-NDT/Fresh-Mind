import React, { useEffect, useMemo, useState } from 'react'
import './SphereDetailPanel.css'

const RANGES = [
  { days: 30, label: '30 дн' },
  { days: 90, label: '90 дн' },
  { days: 365, label: '1 год' }
]

function fmtDate(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })
}

function fmtDateLong(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })
}

function stripHtml(html) {
  if (!html) return ''
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || ''
}

function HistoryChart({ history, days, color }) {
  const W = 700
  const H = 80
  const PAD_L = 22
  const PAD_R = 8
  const PAD_T = 4
  const PAD_B = 14
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const sinceMs = today.getTime() - (days - 1) * 86400000

  function xFor(dateStr) {
    const t = new Date(dateStr + 'T00:00:00').getTime()
    const frac = (t - sinceMs) / ((days - 1) * 86400000)
    return PAD_L + frac * innerW
  }
  function yFor(value) {
    return PAD_T + (1 - value / 10) * innerH
  }

  const points = history
    .map(p => ({ x: xFor(p.date), y: yFor(p.value), value: p.value, date: p.date }))
    .sort((a, b) => a.x - b.x)

  const linePath = points.length
    ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
    : ''

  const areaPath = points.length >= 2
    ? `${linePath} L ${points[points.length - 1].x.toFixed(1)},${(PAD_T + innerH).toFixed(1)} L ${points[0].x.toFixed(1)},${(PAD_T + innerH).toFixed(1)} Z`
    : ''

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sdp-chart-svg" preserveAspectRatio="xMidYMid meet">
      {[0, 5, 10].map(v => (
        <g key={v}>
          <line
            x1={PAD_L} y1={yFor(v)} x2={W - PAD_R} y2={yFor(v)}
            stroke="rgba(155, 123, 217, 0.14)" strokeWidth="1"
            strokeDasharray={v === 0 || v === 10 ? '' : '3 3'}
          />
          <text x={PAD_L - 6} y={yFor(v) + 3} textAnchor="end" className="sdp-axis-text">{v}</text>
        </g>
      ))}

      {points.length === 0 && (
        <text x={W / 2} y={H / 2} textAnchor="middle" dominantBaseline="central" className="sdp-empty-text">
          нет данных за этот период
        </text>
      )}

      {areaPath && <path d={areaPath} fill={color} opacity={0.18} />}
      {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />}

      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="#fff" stroke={color} strokeWidth="2" />
          <title>{p.date} — {p.value}</title>
        </g>
      ))}
    </svg>
  )
}

export default function SphereDetailPanel({ sphereId, onClose, refreshKey = 0 }) {
  const [sphere, setSphere] = useState(null)
  const [days, setDays] = useState(30)
  const [history, setHistory] = useState([])
  const [entries, setEntries] = useState([])
  const [closing, setClosing] = useState(false)

  function handleClose() {
    setClosing(true)
    setTimeout(() => onClose(), 220)
  }

  useEffect(() => {
    if (sphereId == null) return
    window.freshMind.getSpheres().then(all => {
      setSphere((all || []).find(s => s.id === sphereId) || null)
    })
  }, [sphereId])

  useEffect(() => {
    if (sphereId == null) return
    Promise.all([
      window.freshMind.getSphereHistory(sphereId, days),
      window.freshMind.getEntriesForSphere(sphereId, 5)
    ]).then(([h, e]) => {
      setHistory(h || [])
      setEntries(e || [])
    })
  }, [sphereId, days, refreshKey])

  // Esc — закрыть
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const stats = useMemo(() => {
    if (!history.length) return { avg: null, max: null, min: null, count: 0 }
    const vals = history.map(p => p.value)
    const sum = vals.reduce((a, b) => a + b, 0)
    return {
      avg: sum / vals.length,
      max: Math.max(...vals),
      min: Math.min(...vals),
      count: vals.length
    }
  }, [history])

  if (!sphere) return null

  return (
    <div className={`sphere-detail-panel ${closing ? 'is-closing' : ''}`} style={{ borderColor: sphere.color }}>
      <div className="sdp-header">
        <span className="sdp-dot" style={{ background: sphere.color }} />
        <h3 className="sdp-name">{sphere.name}</h3>
        {sphere.description && <span className="sdp-desc">{sphere.description}</span>}
        <div className="sdp-tabs">
          {RANGES.map(r => (
            <button
              key={r.days}
              className={`sdp-tab ${days === r.days ? 'on' : ''}`}
              onClick={() => setDays(r.days)}
              style={days === r.days ? { borderColor: sphere.color, color: sphere.color } : null}
            >{r.label}</button>
          ))}
        </div>
        <button className="sdp-close" onClick={handleClose} title="Закрыть (Esc)">×</button>
      </div>

      <div className="sdp-body">
        <div className="sdp-left">
          <HistoryChart history={history} days={days} color={sphere.color} />
          <div className="sdp-stats">
            <div className="sdp-stat">
              <span className="sdp-stat-label">среднее</span>
              <span className="sdp-stat-value">{stats.avg != null ? stats.avg.toFixed(1) : '—'}</span>
            </div>
            <div className="sdp-stat">
              <span className="sdp-stat-label">максимум</span>
              <span className="sdp-stat-value">{stats.max ?? '—'}</span>
            </div>
            <div className="sdp-stat">
              <span className="sdp-stat-label">минимум</span>
              <span className="sdp-stat-value">{stats.min ?? '—'}</span>
            </div>
            <div className="sdp-stat">
              <span className="sdp-stat-label">отметок</span>
              <span className="sdp-stat-value">{stats.count}</span>
            </div>
          </div>
        </div>

        <div className="sdp-entries">
          <div className="sdp-entries-header">последние записи со сферой</div>
          {entries.length === 0 && (
            <div className="sdp-entries-empty">пока нет записей с этой сферой</div>
          )}
          {entries.map(e => {
            const preview = (e.content_text || stripHtml(e.content_html) || '').trim().slice(0, 140)
            return (
              <div key={e.id} className="sdp-entry">
                <div className="sdp-entry-meta">
                  <span className="sdp-entry-date">{fmtDateLong(e.created_at)}</span>
                  {e.mood_emoji && <span className="sdp-entry-mood">{e.mood_emoji}</span>}
                  {e.pinned && <span className="sdp-entry-pinned" title="Памятка">📌</span>}
                </div>
                <div className="sdp-entry-preview">{preview || <em>пусто</em>}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
