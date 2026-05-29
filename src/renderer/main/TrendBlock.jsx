import React, { useEffect, useState } from 'react'
import './TrendBlock.css'

function shiftDateStr(iso, deltaDays) {
  const [y, m, d] = iso.split('-').map(Number)
  const nx = new Date(y, m - 1, d + deltaDays)
  return `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, '0')}-${String(nx.getDate()).padStart(2, '0')}`
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек']
  return `${dt.getDate()} ${months[dt.getMonth()]}`
}

export default function TrendBlock({ date = todayISO(), refreshKey = 0 }) {
  const [trendDays, setTrendDays] = useState(30)
  const [points, setPoints] = useState([])
  const [hoverIdx, setHoverIdx] = useState(null)
  const [showEntries, setShowEntries] = useState(false)
  const [entryMap, setEntryMap] = useState(new Map()) // date → { entries:[...] }
  const [hoverEntryId, setHoverEntryId] = useState(null)

  useEffect(() => {
    const start = shiftDateStr(date, -(trendDays - 1))
    window.freshMind.getDailyAverages(start, date).then(rows => setPoints(rows || []))
  }, [date, trendDays, refreshKey])

  useEffect(() => {
    if (!showEntries) { setEntryMap(new Map()); return }
    const start = shiftDateStr(date, -(trendDays - 1))
    window.freshMind.getEntriesByDay(start, date).then(rows => {
      const m = new Map()
      for (const r of (rows || [])) m.set(r.date, r.entries)
      setEntryMap(m)
    })
  }, [showEntries, date, trendDays, refreshKey])

  const W = 720, H = 130
  const PAD_L = 26, PAD_R = 14, PAD_T = 12, PAD_B = 20
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const color = 'var(--fm-main)'
  const colorHex = '#9B7BD9'

  const days = points.length
  function xFor(i) { return PAD_L + (days === 1 ? innerW / 2 : (i / (days - 1)) * innerW) }
  function yFor(v) { return PAD_T + (1 - v / 10) * innerH }

  const linePoints = points.map((p, i) => ({ x: xFor(i), y: yFor(p.avg) }))
  const linePath = linePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = linePoints.length >= 2
    ? `${linePath} L ${linePoints[linePoints.length - 1].x.toFixed(1)},${(PAD_T + innerH).toFixed(1)} L ${linePoints[0].x.toFixed(1)},${(PAD_T + innerH).toFixed(1)} Z`
    : ''

  const hover = hoverIdx != null && linePoints[hoverIdx] ? { ...linePoints[hoverIdx], data: points[hoverIdx] } : null

  return (
    <div className="trend-block">
      <div className="trend-header">
        <div className="trend-tabs">
          {[
            { d: 7,   label: '7 дн' },
            { d: 30,  label: '30 дн' },
            { d: 90,  label: '90 дн' },
            { d: 180, label: '6 мес' },
            { d: 365, label: '1 год' }
          ].map(t => (
            <button
              key={t.d}
              className={`trend-tab ${trendDays === t.d ? 'on' : ''}`}
              onClick={() => setTrendDays(t.d)}
            >{t.label}</button>
          ))}
        </div>
        <button
          className={`trend-entries-toggle ${showEntries ? 'on' : ''}`}
          onClick={() => setShowEntries(v => !v)}
          title={showEntries ? 'Скрыть метки записей на графике' : 'Показать дни с записями на графике'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
            <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
            <path d="M9 13l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>
      <div className="trend-svg-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} className="trend-svg" preserveAspectRatio="none">
          {[0, 5, 10].map(v => (
            <g key={v}>
              <line x1={PAD_L} y1={yFor(v)} x2={W - PAD_R} y2={yFor(v)} stroke="rgba(155,123,217,0.14)" strokeWidth="1" strokeDasharray={v === 0 || v === 10 ? '' : '3 3'} />
              <text x={PAD_L - 6} y={yFor(v) + 3} textAnchor="end" className="trend-axis">{v}</text>
            </g>
          ))}
          {!points.length && (
            <text x={W / 2} y={H / 2} textAnchor="middle" dominantBaseline="central" className="trend-empty">нет оценок за период</text>
          )}
          {areaPath && <path d={areaPath} fill={colorHex} opacity={0.18} />}
          {linePath && <path d={linePath} fill="none" stroke={colorHex} strokeWidth="2.5" strokeLinejoin="round" />}
          {linePoints.map((p, i) => (
            <g key={i}>
              {/* Большая невидимая область для удобного наведения */}
              <circle
                cx={p.x} cy={p.y} r="14"
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
                style={{ cursor: 'pointer' }}
              />
              <circle
                cx={p.x} cy={p.y}
                r={hoverIdx === i ? 5 : 3.5}
                fill={colorHex}
                style={{ pointerEvents: 'none', transition: 'r 120ms' }}
              />
            </g>
          ))}
          {hover && (
            <g pointerEvents="none">
              <line x1={hover.x} y1={PAD_T} x2={hover.x} y2={PAD_T + innerH} stroke={colorHex} strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
            </g>
          )}

          {/* Оверлей: иконки записей по времени (приоритет: эмодзи → цвет сферы → тег) */}
          {showEntries && points.length > 0 && (() => {
            const start = points[0].date
            const startMs = new Date(start + 'T00:00:00').getTime()
            const totalMs = days <= 1 ? 86400000 : (days - 1) * 86400000
            const yBase = PAD_T + innerH
            const items = []
            // Каждая запись получает X по своему ts (точность до минут).
            // Для тогл-наведения работает по конкретной entry.id, не по дню.
            const allEntries = []
            for (const [d, entries] of entryMap) {
              for (const e of (entries || [])) {
                if (e.ts >= startMs - 86400000 && e.ts <= startMs + totalMs + 86400000) {
                  allEntries.push({ ...e, _date: d })
                }
              }
            }
            for (const e of allEntries) {
              const frac = (e.ts - startMs) / totalMs
              if (frac < -0.02 || frac > 1.02) continue
              const x = PAD_L + Math.max(0, Math.min(1, frac)) * innerW
              // Приоритет для маркера: эмодзи → цвет первой сферы → тег → дефолт
              const isHover = hoverEntryId === e.id
              const y = yBase - 6 - (isHover ? 2 : 0)

              let marker
              if (e.mood) {
                marker = (
                  <text
                    x={x} y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ fontSize: isHover ? 18 : 14, transition: 'font-size 120ms' }}
                  >{e.mood}</text>
                )
              } else if (e.spheres && e.spheres.length > 0) {
                marker = (
                  <circle cx={x} cy={y}
                    r={isHover ? 6 : 5}
                    fill={e.spheres[0].color}
                    stroke="#fff" strokeWidth="1.5"
                    style={{ transition: 'r 120ms' }} />
                )
              } else if (e.tags && e.tags.length > 0) {
                marker = (
                  <g>
                    <circle cx={x} cy={y} r={isHover ? 8 : 7} fill="rgba(63,171,141,0.18)" stroke="#3FAB8D" strokeWidth="1.5" style={{ transition: 'r 120ms' }} />
                    <text x={x} y={y + 0.5} textAnchor="middle" dominantBaseline="central" fill="#3FAB8D" style={{ fontSize: 9, fontWeight: 700 }}>#</text>
                  </g>
                )
              } else {
                marker = (
                  <circle cx={x} cy={y}
                    r={isHover ? 5 : 4}
                    fill="#3FAB8D" stroke="#fff" strokeWidth="1.5"
                    style={{ transition: 'r 120ms' }} />
                )
              }

              items.push(
                <g key={e.id}>
                  {isHover && (
                    <line x1={x} y1={PAD_T} x2={x} y2={yBase}
                      stroke="#3FAB8D" strokeWidth="1.5" strokeDasharray="2 3" opacity="0.6" />
                  )}
                  {marker}
                  <rect
                    x={x - 9} y={yBase - 18}
                    width="18" height="24"
                    fill="transparent"
                    onMouseEnter={() => setHoverEntryId(e.id)}
                    onMouseLeave={() => setHoverEntryId(null)}
                    style={{ cursor: 'pointer' }}
                  />
                </g>
              )
            }
            return <g>{items}</g>
          })()}
        </svg>
        {hover && (
          <div
            className="trend-tooltip"
            style={{
              left: `${(hover.x / W) * 100}%`,
              top: `${(hover.y / H) * 100}%`
            }}
          >
            <div className="trend-tooltip-value">{hover.data.avg.toFixed(2)}</div>
            <div className="trend-tooltip-date">{formatDateLabel(hover.data.date)}</div>
          </div>
        )}

        {/* Тултип одной записи под маркером */}
        {showEntries && hoverEntryId && points.length > 0 && (() => {
          const start = points[0].date
          const startMs = new Date(start + 'T00:00:00').getTime()
          const totalMs = days <= 1 ? 86400000 : (days - 1) * 86400000
          let target = null
          for (const [, entries] of entryMap) {
            const found = (entries || []).find(e => e.id === hoverEntryId)
            if (found) { target = found; break }
          }
          if (!target) return null
          const frac = (target.ts - startMs) / totalMs
          const x = PAD_L + Math.max(0, Math.min(1, frac)) * innerW
          const dt = new Date(target.ts)
          const hh = String(dt.getHours()).padStart(2, '0')
          const mm = String(dt.getMinutes()).padStart(2, '0')
          const dateLabel = formatDateLabel(
            `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
          )
          return (
            <div
              className="trend-entries-tooltip"
              style={{
                left: `${(x / W) * 100}%`,
                bottom: '12px'
              }}
            >
              <div className="tet-header">
                {dateLabel}, {hh}:{mm}{target.mood && <> · <span className="tet-mood">{target.mood}</span></>}
              </div>
              <div className="tet-entry-text">
                {(target.text || '').slice(0, 180) || <em>пустая запись</em>}{target.text && target.text.length > 180 ? '…' : ''}
              </div>
              {target.spheres && target.spheres.length > 0 && (
                <div className="tet-spheres">
                  {target.spheres.map((s, i) => (
                    <span key={i} className="tet-sphere">
                      <span className="tet-sphere-dot" style={{ background: s.color }} />
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
              {target.tags && target.tags.length > 0 && (
                <div className="tet-tags">{target.tags.map(t => `#${t}`).join(' ')}</div>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
}
