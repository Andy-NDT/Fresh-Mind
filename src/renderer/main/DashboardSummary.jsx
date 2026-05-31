import React, { useEffect, useMemo, useState } from 'react'
import './DashboardSummary.css'

const CANONICAL_GROUPS = ['Здоровье', 'Общество', 'Труд', 'Развитие']
// Порядок плиток — как квадранты колеса (по часовой стрелке от верх-лево)
const DISPLAY_GROUP_ORDER = ['Здоровье', 'Общество', 'Развитие', 'Труд']

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Rolling number — анимация перехода между значениями
function RollingNumber({ value, format = (v) => v.toFixed(1), duration = 400 }) {
  const [shown, setShown] = useState(value ?? null)
  useEffect(() => {
    if (value == null) { setShown(null); return }
    if (shown == null) { setShown(value); return }
    const from = shown
    const to = value
    if (from === to) return
    const start = performance.now()
    let raf
    const step = (t) => {
      const k = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - k, 3)
      const cur = from + (to - from) * eased
      setShown(cur)
      if (k < 1) raf = requestAnimationFrame(step)
      else setShown(to)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  if (shown == null) return <>—</>
  return <>{format(shown)}</>
}

function aggregate(spheres, groups, ratings, yesterdayRatings = [], fallbackRatings = []) {
  const groupByName = new Map(groups.map(g => [g.name?.trim(), g]))
  const ratingMap = new Map(ratings.map(r => [r.sphere_id, r.value]))
  const yesterdayMap = new Map(yesterdayRatings.map(r => [r.sphere_id, r.value]))
  const fallbackMap = new Map(fallbackRatings.map(r => [r.sphere_id, { value: r.value, date: r.date }]))
  function deltaFor(sphereId, todayValue) {
    const y = yesterdayMap.get(sphereId)
    if (y != null) return { delta: todayValue - y, sinceLabel: 'вчера' }
    const fb = fallbackMap.get(sphereId)
    if (fb && fb.value != null) return { delta: todayValue - fb.value, sinceLabel: fb.date }
    return null
  }

  const canonicalSpheres = []
  for (const groupName of CANONICAL_GROUPS) {
    const g = groupByName.get(groupName)
    if (!g) continue
    const inGroup = spheres
      .filter(s => s.group_id === g.id)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .slice(0, 5)
    canonicalSpheres.push(...inGroup)
  }

  const groupStats = []
  for (const groupName of DISPLAY_GROUP_ORDER) {
    const g = groupByName.get(groupName)
    if (!g) continue
    const inGroup = canonicalSpheres.filter(s => s.group_id === g.id)
    const rated = inGroup.filter(s => ratingMap.has(s.id))
    const avg = rated.length
      ? rated.reduce((sum, s) => sum + ratingMap.get(s.id), 0) / rated.length
      : null
    groupStats.push({ group: g, avg, rated: rated.length, total: inGroup.length })
  }

  const rated = canonicalSpheres
    .filter(s => ratingMap.has(s.id))
    .map(s => ({ ...s, value: ratingMap.get(s.id) }))

  const sorted = [...rated].sort((a, b) => b.value - a.value)
  const highestRaw = sorted[0] ?? null
  const lowestRaw = sorted.length > 1 ? sorted[sorted.length - 1] : null
  return {
    groupStats,
    todayCount: rated.length,
    totalCount: canonicalSpheres.length,
    highest: highestRaw ? { ...highestRaw, delta: deltaFor(highestRaw.id, highestRaw.value) } : null,
    lowest: lowestRaw ? { ...lowestRaw, delta: deltaFor(lowestRaw.id, lowestRaw.value) } : null,
    overallAvg: rated.length ? rated.reduce((s, x) => s + x.value, 0) / rated.length : null
  }
}

// Хелпер для отрисовки дельты в плитках Выше всех / Ниже всех
function renderDelta(deltaObj) {
  if (deltaObj == null) {
    return <span className="ds-spheredelta stable" title="Нет предыдущих оценок">—</span>
  }
  const { delta, sinceLabel } = deltaObj
  const title = `Изменение с ${sinceLabel}`
  if (Math.abs(delta) < 0.1) {
    return <span className="ds-spheredelta stable" title={title}>=</span>
  }
  const sign = delta > 0 ? '↑ +' : '↓ '
  const cls = delta > 0 ? 'pos' : 'neg'
  return <span className={`ds-spheredelta ${cls}`} title={title}>{sign}{Math.abs(delta).toFixed(1)}</span>
}

function shiftDateStrLocal(iso, deltaDays) {
  const [y, m, d] = iso.split('-').map(Number)
  const nx = new Date(y, m - 1, d + deltaDays)
  return `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, '0')}-${String(nx.getDate()).padStart(2, '0')}`
}

export default function DashboardSummary({ date = todayISO(), compareDate = null, refreshKey = 0 }) {
  const [spheres, setSpheres] = useState([])
  const [groups, setGroups] = useState([])
  const [ratings, setRatings] = useState([])
  const [yesterdayRatings, setYesterdayRatings] = useState([])
  const [fallbackRatings, setFallbackRatings] = useState([])
  const [compareRatings, setCompareRatings] = useState([])

  useEffect(() => {
    const yesterday = shiftDateStrLocal(date, -1)
    Promise.all([
      window.freshMind.getSpheres(),
      window.freshMind.getGroups(),
      window.freshMind.getRatingsForDate(date),
      window.freshMind.getRatingsForDate(yesterday),
      window.freshMind.getLastRatingsBefore(date)
    ]).then(([sphs, grps, rs, yrs, fbs]) => {
      setSpheres((sphs || []).filter(s => !s.archived))
      setGroups(grps || [])
      setRatings(rs || [])
      setYesterdayRatings(yrs || [])
      setFallbackRatings(fbs || [])
    })
  }, [date, refreshKey])

  useEffect(() => {
    if (!compareDate) { setCompareRatings([]); return }
    window.freshMind.getRatingsForDate(compareDate).then(rs => setCompareRatings(rs || []))
  }, [compareDate, refreshKey])

  const main = useMemo(
    () => spheres.length ? aggregate(spheres, groups, ratings, yesterdayRatings, fallbackRatings) : null,
    [spheres, groups, ratings, yesterdayRatings, fallbackRatings]
  )
  const cmp = useMemo(
    () => compareDate && spheres.length ? aggregate(spheres, groups, compareRatings) : null,
    [compareDate, spheres, groups, compareRatings]
  )

  if (!main) return null

  function deltaForGroup(idx) {
    if (!cmp) return null
    const a = main.groupStats[idx]?.avg
    const b = cmp.groupStats[idx]?.avg
    if (a == null || b == null) return null
    return a - b
  }

  return (
    <div className={`dashboard-summary ${compareDate ? 'is-compare' : ''}`}>
      {/* 4 группы */}
      <div className="ds-row ds-groups">
        {main.groupStats.map(({ group, avg, rated, total }, idx) => {
          const delta = deltaForGroup(idx)
          return (
            <div
              key={group.id}
              className="ds-group-tile"
              style={{ background: group.color + '55', borderColor: group.color }}
            >
              <div className="ds-group-name">{group.name}</div>
              <div className="ds-group-avg">
                {avg != null ? <RollingNumber value={avg} /> : '—'}
              </div>
              <div className="ds-group-meta">
                <span>{rated}/{total} сфер</span>
                {delta != null && (
                  <span className={`ds-delta ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'zero'}`}>
                    {delta > 0 ? '+' : ''}{delta.toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 4 метрики дня */}
      <div className="ds-row ds-metrics">
        <div className="ds-metric-tile">
          <div className="ds-metric-label">Отмечено сфер</div>
          <div className="ds-metric-value">
            {main.todayCount}<span className="ds-metric-of">/{main.totalCount}</span>
          </div>
        </div>
        <div className="ds-metric-tile">
          <div className="ds-metric-label">Средняя</div>
          <div className="ds-metric-value">
            {main.overallAvg != null ? <RollingNumber value={main.overallAvg} /> : '—'}
          </div>
        </div>
        <div className="ds-metric-tile">
          <div className="ds-metric-label">Выше всех</div>
          <div className="ds-metric-value with-dot">
            {main.highest ? (
              <>
                <span className="ds-dot" style={{ background: main.highest.color }} />
                <span className="ds-metric-name">{main.highest.name}</span>
                <span className="ds-metric-num">{main.highest.value}</span>
                {renderDelta(main.highest.delta)}
              </>
            ) : '—'}
          </div>
        </div>
        <div className="ds-metric-tile">
          <div className="ds-metric-label">Ниже всех</div>
          <div className="ds-metric-value with-dot">
            {main.lowest ? (
              <>
                <span className="ds-dot" style={{ background: main.lowest.color }} />
                <span className="ds-metric-name">{main.lowest.name}</span>
                <span className="ds-metric-num">{main.lowest.value}</span>
                {renderDelta(main.lowest.delta)}
              </>
            ) : '—'}
          </div>
        </div>
      </div>
    </div>
  )
}
