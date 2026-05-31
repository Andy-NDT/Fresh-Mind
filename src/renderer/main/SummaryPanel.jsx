import React, { useEffect, useMemo, useState } from 'react'
import './SummaryPanel.css'

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']
const MONTH_NAMES_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']

function pad2(n) { return String(n).padStart(2, '0') }

// Возвращает [startISO, endISO] для месяца [year, month] (month 0..11) или для года.
function periodRange(mode, year, month) {
  if (mode === 'year') {
    return [`${year}-01-01`, `${year}-12-31`]
  }
  const start = `${year}-${pad2(month + 1)}-01`
  // Последний день месяца
  const lastDay = new Date(year, month + 1, 0).getDate()
  const end = `${year}-${pad2(month + 1)}-${pad2(lastDay)}`
  return [start, end]
}

function prevPeriod(mode, year, month) {
  if (mode === 'year') return { year: year - 1, month }
  if (month === 0) return { year: year - 1, month: 11 }
  return { year, month: month - 1 }
}

function nextPeriod(mode, year, month) {
  if (mode === 'year') return { year: year + 1, month }
  if (month === 11) return { year: year + 1, month: 0 }
  return { year, month: month + 1 }
}

function periodLabel(mode, year, month) {
  if (mode === 'year') return `${year}`
  return `${MONTH_NAMES[month].toLowerCase()}, ${year}`
}

function periodLabelGen(mode, year, month) {
  if (mode === 'year') return `${year} год`
  return `${MONTH_NAMES_GEN[month]} ${year}`
}

export default function SummaryPanel({ refreshKey = 0 }) {
  const today = new Date()
  const [mode, setMode] = useState('month')
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [expanded, setExpanded] = useState(false)
  const [stats, setStats] = useState(null)
  const [prevStats, setPrevStats] = useState(null)
  const [loading, setLoading] = useState(false)

  const [startISO, endISO] = useMemo(() => periodRange(mode, year, month), [mode, year, month])

  useEffect(() => {
    if (!expanded) return
    setLoading(true)
    const prev = prevPeriod(mode, year, month)
    const [prevStartISO, prevEndISO] = periodRange(mode, prev.year, prev.month)
    Promise.all([
      window.freshMind.getSummaryStats({ startISO, endISO }),
      window.freshMind.getSummaryStats({ startISO: prevStartISO, endISO: prevEndISO })
    ]).then(([cur, prv]) => {
      setStats(cur)
      setPrevStats(prv)
      setLoading(false)
    })
  }, [expanded, mode, year, month, refreshKey])

  function shiftPeriod(dir) {
    const next = dir > 0 ? nextPeriod(mode, year, month) : prevPeriod(mode, year, month)
    setYear(next.year)
    setMonth(next.month)
  }

  function isFuturePeriod() {
    if (mode === 'year') return year >= today.getFullYear()
    return year > today.getFullYear() ||
      (year === today.getFullYear() && month >= today.getMonth())
  }

  // Сравнение сфер с предыдущим периодом + сортировка по среднему (рейтинг)
  const sphereDeltas = useMemo(() => {
    if (!stats || !stats.sphereAvgs) return []
    const prevById = new Map((prevStats?.sphereAvgs || []).map(s => [s.id, s.avg]))
    return stats.sphereAvgs
      .map(s => {
        const prevAvg = prevById.get(s.id)
        const delta = prevAvg != null ? s.avg - prevAvg : null
        return { ...s, prevAvg, delta }
      })
      .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
  }, [stats, prevStats])

  const totalDelta = stats && prevStats != null ? stats.totalEntries - prevStats.totalEntries : null
  const daysInPeriod = mode === 'year' ? 365 : new Date(year, month + 1, 0).getDate()

  return (
    <div className={`summary-panel ${expanded ? 'is-expanded' : ''}`}>
      <div
        className="sp-header"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(v => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(v => !v) } }}
        title={expanded ? 'Свернуть сводку' : 'Развернуть сводку за период'}
      >
        <span className="sp-title">
          <span className="sp-title-strong">Сводка</span>
          <span className="sp-title-meta">{periodLabel(mode, year, month)}</span>
        </span>
        <div className="sp-period-ctrls" onClick={e => e.stopPropagation()}>
          <button
            className={`sp-mode-btn ${mode === 'month' ? 'on' : ''}`}
            onClick={() => setMode('month')}
          >мес</button>
          <button
            className={`sp-mode-btn ${mode === 'year' ? 'on' : ''}`}
            onClick={() => setMode('year')}
          >год</button>
          <button className="sp-nav-btn" onClick={() => shiftPeriod(-1)} title="Предыдущий период">‹</button>
          <button
            className="sp-nav-btn"
            onClick={() => shiftPeriod(1)}
            disabled={isFuturePeriod()}
            title="Следующий период"
          >›</button>
        </div>
      </div>

      {expanded && (
        <div className="sp-body">
          {loading && <div className="sp-loading fm-pulse">Считаю</div>}
          {!loading && stats && (
            <>
              <div className="sp-row sp-key-numbers">
                <div className="sp-tile">
                  <div className="sp-tile-value">{stats.totalEntries}</div>
                  <div className="sp-tile-label">{stats.totalEntries === 1 ? 'запись' : 'записей'}</div>
                  {totalDelta != null && totalDelta !== 0 && (
                    <div className={`sp-tile-delta ${totalDelta > 0 ? 'pos' : 'neg'}`}>
                      {totalDelta > 0 ? '+' : ''}{totalDelta}
                    </div>
                  )}
                </div>
                <div className="sp-tile">
                  <div className="sp-tile-value">{stats.activeDays}<span className="sp-tile-of">/{daysInPeriod}</span></div>
                  <div className="sp-tile-label">дней с записями</div>
                </div>
                <div className="sp-tile">
                  <div className="sp-tile-value">
                    {stats.activeDay ? stats.activeDay.cnt : '—'}
                  </div>
                  <div className="sp-tile-label">в самый активный</div>
                  {stats.activeDay && (
                    <div className="sp-tile-sub">{formatDateShort(stats.activeDay.date)}</div>
                  )}
                </div>
              </div>

              {stats.topTags && stats.topTags.length > 0 && (
                <div className="sp-section">
                  <div className="sp-section-label">Топ-теги</div>
                  <div className="sp-tags">
                    {stats.topTags.map(t => (
                      <span key={t.name} className="sp-tag">
                        <span className="sp-tag-name">#{t.name}</span>
                        <span className="sp-tag-cnt">{t.cnt}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {stats.moods && stats.moods.length > 0 && (
                <div className="sp-section">
                  <div className="sp-section-label">Настроения</div>
                  <div className="sp-moods">
                    {stats.moods.map(m => (
                      <span key={m.emoji} className="sp-mood">
                        <span className="sp-mood-emoji">{m.emoji}</span>
                        <span className="sp-mood-cnt">{m.cnt}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {sphereDeltas.length > 0 && (
                <div className="sp-section">
                  <div className="sp-section-label">Сферы: среднее и дельта</div>
                  <div className="sp-sphere-grid">
                    {sphereDeltas.map(s => (
                      <div key={s.id} className="sp-sphere">
                        <span className="sp-sphere-dot" style={{ background: s.color }} />
                        <span className="sp-sphere-name">{s.name}</span>
                        <span className="sp-sphere-avg">{s.avg.toFixed(1)}</span>
                        {s.delta != null && (
                          <span className={`sp-sphere-delta ${s.delta > 0.05 ? 'pos' : s.delta < -0.05 ? 'neg' : 'zero'}`}>
                            {s.delta > 0 ? '+' : ''}{s.delta.toFixed(1)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {stats.totalEntries === 0 && (
                <div className="sp-empty">Записей за {periodLabelGen(mode, year, month)} нет.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function formatDateShort(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек']
  return `${d} ${months[m - 1]}`
}
