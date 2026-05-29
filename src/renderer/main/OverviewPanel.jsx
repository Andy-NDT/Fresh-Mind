import React, { useEffect, useMemo, useState } from 'react'
import './OverviewPanel.css'

function shiftDateStr(iso, deltaDays) {
  const [y, m, d] = iso.split('-').map(Number)
  const nx = new Date(y, m - 1, d + deltaDays)
  return `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, '0')}-${String(nx.getDate()).padStart(2, '0')}`
}

function TrendChart({ points, color = '#9B7BD9' }) {
  const W = 320, H = 90
  const PAD_L = 18, PAD_R = 8, PAD_T = 6, PAD_B = 16
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  if (!points.length) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="overview-trend-svg">
        <text x={W / 2} y={H / 2} textAnchor="middle" dominantBaseline="central" className="overview-trend-empty">нет оценок за период</text>
      </svg>
    )
  }

  const days = points.length
  function xFor(i) { return PAD_L + (days === 1 ? innerW / 2 : (i / (days - 1)) * innerW) }
  function yFor(v) { return PAD_T + (1 - v / 10) * innerH }

  const linePoints = points.map((p, i) => ({ x: xFor(i), y: yFor(p.avg) }))
  const linePath = linePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = linePoints.length >= 2
    ? `${linePath} L ${linePoints[linePoints.length - 1].x.toFixed(1)},${(PAD_T + innerH).toFixed(1)} L ${linePoints[0].x.toFixed(1)},${(PAD_T + innerH).toFixed(1)} Z`
    : ''

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="overview-trend-svg">
      {[0, 5, 10].map(v => (
        <g key={v}>
          <line x1={PAD_L} y1={yFor(v)} x2={W - PAD_R} y2={yFor(v)} stroke="rgba(155,123,217,0.14)" strokeWidth="1" strokeDasharray={v === 0 || v === 10 ? '' : '3 3'} />
          <text x={PAD_L - 4} y={yFor(v) + 3} textAnchor="end" className="overview-trend-axis">{v}</text>
        </g>
      ))}
      {areaPath && <path d={areaPath} fill={color} opacity={0.18} />}
      {linePath && <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />}
      {linePoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="2.5" fill={color}>
          <title>{points[i].date}: {points[i].avg.toFixed(1)}</title>
        </circle>
      ))}
    </svg>
  )
}

// Канонический набор групп (для расчёта средних по 5 первым сферам)
const CANONICAL_GROUPS = ['Здоровье', 'Общество', 'Труд', 'Развитие']
// Порядок отображения карточек под колесом — как на самом колесе по строкам:
// верх-лево, низ-лево, низ-право, верх-право (U-shape слева направо)
const DISPLAY_GROUP_ORDER = ['Здоровье', 'Развитие', 'Труд', 'Общество']

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function OverviewPanel({ date = todayISO(), refreshKey = 0 }) {
  const [spheres, setSpheres] = useState([])
  const [groups, setGroups] = useState([])
  const [ratings, setRatings] = useState([])
  const [trend, setTrend] = useState([])
  const [trendDays, setTrendDays] = useState(30)

  useEffect(() => {
    Promise.all([
      window.freshMind.getSpheres(),
      window.freshMind.getGroups(),
      window.freshMind.getRatingsForDate(date)
    ]).then(([sphs, grps, rs]) => {
      setSpheres((sphs || []).filter(s => !s.archived))
      setGroups(grps || [])
      setRatings(rs || [])
    })
  }, [date, refreshKey])

  useEffect(() => {
    const start = shiftDateStr(date, -(trendDays - 1))
    window.freshMind.getDailyAverages(start, date).then(rows => setTrend(rows || []))
  }, [date, trendDays, refreshKey])

  const stats = useMemo(() => {
    if (!spheres.length || !groups.length) return null
    const groupByName = new Map(groups.map(g => [g.name?.trim(), g]))
    const ratingMap = new Map(ratings.map(r => [r.sphere_id, r.value]))

    // Берём те же 5 сфер на группу, что и RadarChart
    const canonicalSpheres = []
    for (const groupName of CANONICAL_GROUPS) {
      const g = groupByName.get(groupName)
      if (!g) continue
      const inGroup = spheres
        .filter(s => s.group_id === g.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .slice(0, 5)
      canonicalSpheres.push(...inGroup.map(s => ({ ...s, _group: g })))
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

    const ratedSpheres = canonicalSpheres
      .filter(s => ratingMap.has(s.id))
      .map(s => ({ ...s, value: ratingMap.get(s.id) }))

    const todayCount = ratedSpheres.length
    const totalCount = canonicalSpheres.length

    const highest = ratedSpheres.length
      ? [...ratedSpheres].sort((a, b) => b.value - a.value)[0]
      : null
    const lowest = ratedSpheres.length
      ? [...ratedSpheres].sort((a, b) => a.value - b.value)[0]
      : null

    const overallAvg = ratedSpheres.length
      ? ratedSpheres.reduce((s, x) => s + x.value, 0) / ratedSpheres.length
      : null

    return { groupStats, todayCount, totalCount, highest, lowest, overallAvg }
  }, [spheres, groups, ratings])

  if (!stats) return null

  return (
    <div className="overview-panel">
      <div className="overview-row overview-summary">
        <div className="overview-tile">
          <div className="overview-tile-label">Отмечено сегодня</div>
          <div className="overview-tile-value">
            {stats.todayCount}<span className="overview-tile-of">/{stats.totalCount}</span>
          </div>
        </div>
        <div className="overview-tile">
          <div className="overview-tile-label">Средняя</div>
          <div className="overview-tile-value">
            {stats.overallAvg != null ? stats.overallAvg.toFixed(1) : '—'}
          </div>
        </div>
        {stats.highest && (
          <div className="overview-tile">
            <div className="overview-tile-label">Выше всех</div>
            <div className="overview-tile-value with-dot">
              <span className="overview-dot" style={{ background: stats.highest.color }} />
              {stats.highest.name}
              <span className="overview-tile-num">{stats.highest.value}</span>
            </div>
          </div>
        )}
        {stats.lowest && stats.lowest.id !== stats.highest?.id && (
          <div className="overview-tile">
            <div className="overview-tile-label">Ниже всех</div>
            <div className="overview-tile-value with-dot">
              <span className="overview-dot" style={{ background: stats.lowest.color }} />
              {stats.lowest.name}
              <span className="overview-tile-num">{stats.lowest.value}</span>
            </div>
          </div>
        )}
      </div>

      <div className="overview-row overview-groups">
        {stats.groupStats.map(({ group, avg, rated, total }) => (
          <div
            key={group.id}
            className="overview-group-tile"
            style={{ background: group.color + '55', borderColor: group.color }}
          >
            <div className="overview-group-name">{group.name}</div>
            <div className="overview-group-avg">
              {avg != null ? avg.toFixed(1) : '—'}
            </div>
            <div className="overview-group-detail">{rated}/{total} сфер</div>
          </div>
        ))}
      </div>

      <div className="overview-trend">
        <div className="overview-trend-header">
          <span className="overview-trend-title">Динамика общей средней</span>
          <div className="overview-trend-tabs">
            {[7, 30, 90].map(d => (
              <button
                key={d}
                className={`overview-trend-tab ${trendDays === d ? 'on' : ''}`}
                onClick={() => setTrendDays(d)}
              >{d} дн</button>
            ))}
          </div>
        </div>
        <TrendChart points={trend} />
      </div>
    </div>
  )
}
