import React, { useEffect, useRef, useState } from 'react'
import './TrendBlock.css'
import ShareDialog from '../shared/ShareDialog.jsx'

const PERIOD_LABEL = { 7: '7dn', 30: '30dn', 90: '90dn', 180: '6mes', 365: '1god' }

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

function ruPlural(n, one, few, many) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

export default function TrendBlock({ date = todayISO(), refreshKey = 0 }) {
  const [trendDays, setTrendDays] = useState(30)
  const [rawPoints, setRawPoints] = useState([])
  const [hoverIdx, setHoverIdx] = useState(null)
  const [showEntries, setShowEntries] = useState(false)
  const [entryMap, setEntryMap] = useState(new Map()) // date → { entries:[...] }
  const [hoverEntryId, setHoverEntryId] = useState(null)
  // Метаданные недель — для богатого тултипа и метки-маркера над неделей.
  // Сами записи не показываем в чарте: для них есть полноценная лента ниже.
  const [weeklyStats, setWeeklyStats] = useState({})

  // Режим графика: суточный для коротких периодов, недельный для длинных.
  // При >= 180 дней суточные точки сливаются в кашу, поэтому агрегируем по неделям.
  const MODE = trendDays >= 180 ? 'weekly' : 'daily'

  useEffect(() => {
    const start = shiftDateStr(date, -(trendDays - 1))
    if (MODE === 'weekly') {
      window.freshMind.getWeeklyAverages(start, date).then(rows => setRawPoints(rows || []))
    } else {
      window.freshMind.getDailyAverages(start, date).then(rows => setRawPoints(rows || []))
    }
  }, [date, trendDays, refreshKey, MODE])

  useEffect(() => {
    if (MODE !== 'weekly') { setWeeklyStats({}); return }
    const start = shiftDateStr(date, -(trendDays - 1))
    window.freshMind.getWeeklyEntryStats(start, date).then(stats => setWeeklyStats(stats || {}))
  }, [date, trendDays, refreshKey, MODE])

  useEffect(() => {
    // Маркеры записей по таймстемпам — пока только в daily-режиме (в weekly будут
    // агрегированные по-недельные маркеры в 16.6).
    if (!showEntries || MODE === 'weekly') { setEntryMap(new Map()); return }
    const start = shiftDateStr(date, -(trendDays - 1))
    window.freshMind.getEntriesByDay(start, date).then(rows => {
      const m = new Map()
      for (const r of (rows || [])) m.set(r.date, r.entries)
      setEntryMap(m)
    })
  }, [showEntries, date, trendDays, refreshKey, MODE])

  // Нормализуем сырые точки к общей форме { date, avg, raw } — так существующий
  // рендер SVG работает в обоих режимах без if/else по всему дереву.
  // raw содержит исходный объект (для daily — {date,avg}, для weekly — {weekStart,weekEnd,avg,ratingsCnt,daysCnt}).
  const points = MODE === 'weekly'
    ? rawPoints.map(p => ({ date: p.weekStart, avg: p.avg, raw: p }))
    : rawPoints.map(p => ({ date: p.date, avg: p.avg, raw: p }))

  // Геометрия: SVG всегда растягивается под контейнер. Y-ось — HTML слева
  // (sticky, не скроллится). Скролл по горизонтали отключён — точки распределены
  // равномерно по индексу, что хорошо читается при любом объёме данных в линейке Fresh.
  const W = 720, H = 130
  const PAD_L = 8, PAD_R = 14, PAD_T = 12, PAD_B = 20
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B
  const colorHex = '#9B7BD9'

  const days = points.length
  function xFor(i) {
    if (days <= 1) return PAD_L + innerW / 2
    return PAD_L + (i / (days - 1)) * innerW
  }
  function yFor(v) { return PAD_T + (1 - v / 10) * innerH }

  // Ref оставлен под будущее использование (например 16.4-16.6 для маркеров).
  // eslint-disable-next-line no-unused-vars
  const scrollRef = useRef(null)

  // Шеринг динамики в PNG (17.4)
  const blockRef = useRef(null)
  const [shareOpen, setShareOpen] = useState(false)

  const linePoints = points.map((p, i) => ({ x: xFor(i), y: yFor(p.avg) }))
  const linePath = linePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = linePoints.length >= 2
    ? `${linePath} L ${linePoints[linePoints.length - 1].x.toFixed(1)},${(PAD_T + innerH).toFixed(1)} L ${linePoints[0].x.toFixed(1)},${(PAD_T + innerH).toFixed(1)} Z`
    : ''

  const hover = hoverIdx != null && linePoints[hoverIdx] ? { ...linePoints[hoverIdx], data: points[hoverIdx] } : null

  return (
    <div className="trend-block" ref={blockRef}>
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
        <div className="trend-header-actions">
          <button
            className="trend-share-btn"
            onClick={() => setShareOpen(true)}
            title="Скачать график как картинку"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
          </button>
          <button
            className={`trend-entries-toggle ${showEntries ? 'on' : ''}`}
            onClick={() => setShowEntries(v => !v)}
            title={
              MODE === 'weekly'
                ? (showEntries ? 'Скрыть счётчики записей по неделям' : 'Показать счётчики записей по неделям')
                : (showEntries ? 'Скрыть метки записей на графике' : 'Показать дни с записями на графике')
            }
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
              <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
              <path d="M9 13l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div className={`trend-svg-wrap trend-svg-wrap-${MODE}`}>
        {/* Sticky Y-ось (HTML, не скроллится). Метки выровнены по yFor(v) в % от высоты. */}
        <div className="trend-yaxis">
          {[0, 5, 10].map(v => (
            <span
              key={v}
              className="trend-yaxis-label"
              style={{ top: `${(yFor(v) / H) * 100}%` }}
            >{v}</span>
          ))}
        </div>
        <div className="trend-scroll">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="trend-svg trend-svg-stretch"
        >
          {[0, 5, 10].map(v => (
            <line
              key={v}
              x1={PAD_L} y1={yFor(v)} x2={W - PAD_R} y2={yFor(v)}
              stroke="rgba(155,123,217,0.14)" strokeWidth="1"
              strokeDasharray={v === 0 || v === 10 ? '' : '3 3'}
            />
          ))}
          {!points.length && (
            <text x={W / 2} y={H / 2} textAnchor="middle" dominantBaseline="central" className="trend-empty">нет оценок за период</text>
          )}
          {areaPath && <path d={areaPath} fill={colorHex} opacity={0.18} />}
          {linePath && <path d={linePath} fill="none" stroke={colorHex} strokeWidth="2.5" strokeLinejoin="round" />}
          {/* Точки данных вынесены в HTML-overlay ниже — в SVG они бы плющились. */}
          {hover && (
            <g pointerEvents="none">
              <line x1={hover.x} y1={PAD_T} x2={hover.x} y2={PAD_T + innerH} stroke={colorHex} strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
            </g>
          )}

          {/* В обоих режимах все маркеры и точки данных — HTML-overlay (см. ниже).
              SVG с preserveAspectRatio="none" плющит круги в эллипсы. */}
        </svg>

        {/* HTML-overlay для точек данных: фиксированный размер, не плющатся.
            При росте плотности точки автоматически меньше — не залипают друг в друга. */}
        {points.length > 0 && (
          <div className={`trend-markers-overlay tdp-density-${days > 60 ? 'dense' : days > 30 ? 'medium' : 'sparse'}`}>
            {linePoints.map((lp, i) => {
              const p = points[i]
              const xPct = (lp.x / W) * 100
              const yPct = (lp.y / H) * 100
              // Низкая выборка в weekly-режиме: меньше 3 дней с оценками за неделю.
              // Визуально подсвечиваем точку как «мало данных, среднее ненадёжно».
              const isLowSample = MODE === 'weekly' && p.raw?.daysCnt != null && p.raw.daysCnt < 3
              const lowSampleHint = isLowSample
                ? `Только ${p.raw.daysCnt} ${ruPlural(p.raw.daysCnt, 'день', 'дня', 'дней')} с оценками — среднее за неделю ненадёжно`
                : undefined
              return (
                <div
                  key={'dp-' + i}
                  className={`trend-data-point ${hoverIdx === i ? 'on' : ''} ${isLowSample ? 'low-sample' : ''}`}
                  style={{ left: `${xPct}%`, top: `${yPct}%` }}
                  title={lowSampleHint}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                />
              )
            })}
          </div>
        )}

        {/* HTML-overlay для weekly: эмодзи+счёт над каждой неделей.
            Hover на маркер → показывает список до 5 записей этой недели. */}
        {MODE === 'weekly' && showEntries && points.length > 0 && (
          <div className="trend-markers-overlay">
            {points.map((p, i) => {
              const stats = weeklyStats[p.date]
              if (!stats || !stats.entriesCnt) return null
              const lp = linePoints[i]
              const xPct = (lp.x / W) * 100
              const ySvg = Math.max(PAD_T + 4, lp.y - 16)
              const yPct = (ySvg / H) * 100
              const translateX = xPct < 12 ? '0%' : xPct > 88 ? '-100%' : '-50%'
              // Только число записей — эмодзи топ-настроения выбирался произвольно
              // когда несколько эмодзи равны по частоте, юзер путался.
              const label = `${stats.entriesCnt} зап`
              return (
                <div
                  key={'wsm-' + i}
                  className="trend-weekly-marker"
                  style={{
                    left: `${xPct}%`,
                    top: `${yPct}%`,
                    transform: `translate(${translateX}, -100%)`
                  }}
                >{label}</div>
              )
            })}
          </div>
        )}


        {/* HTML-overlay для маркеров записей: размер фиксированный (px), не плющится с SVG */}
        {MODE === 'daily' && showEntries && points.length > 0 && (() => {
          const dateIndexMap = new Map()
          points.forEach((p, i) => dateIndexMap.set(p.date, i))
          const slotW = points.length >= 2 ? innerW / (points.length - 1) : innerW
          const items = []
          for (const [, entries] of entryMap) {
            for (const e of (entries || [])) {
              const dt = new Date(e.ts)
              // Локальная дата (не UTC) — точки тренда и getEntriesByDay тоже локальные.
              const localISO = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
              const idx = dateIndexMap.get(localISO)
              if (idx === undefined) continue
              // SVG-координата x в той же системе что и линия
              const baseX = PAD_L + (points.length <= 1 ? innerW / 2 : (idx / (points.length - 1)) * innerW)
              const hourFrac = (dt.getHours() + dt.getMinutes() / 60) / 24
              const jitter = (hourFrac - 0.5) * slotW * 0.4
              const x = baseX + jitter
              // Перевод в проценты от полной ширины SVG (overlay растянут на 100% .trend-scroll)
              const xPctFull = (x / W) * 100
              items.push({ e, xPctFull, isHover: hoverEntryId === e.id })
            }
          }
          return (
            <div className="trend-markers-overlay">
              {items.map(({ e, xPctFull, isHover }) => {
                let inner
                if (e.mood) {
                  inner = <span className="tm-emoji">{e.mood}</span>
                } else if (e.spheres?.length > 0) {
                  inner = <span className="tm-dot" style={{ background: e.spheres[0].color }} />
                } else if (e.tags?.length > 0) {
                  inner = <span className="tm-tag">#</span>
                } else {
                  inner = <span className="tm-dot tm-dot-default" />
                }
                // Flip anchor у самых краёв чтобы маркер не вылазил за чарт
                const tX = xPctFull < 3 ? '0%' : xPctFull > 97 ? '-100%' : '-50%'
                const sc = isHover ? ' scale(1.25)' : ''
                return (
                  <div
                    key={e.id}
                    className={`trend-marker ${isHover ? 'on' : ''}`}
                    style={{
                      left: `${xPctFull}%`,
                      transform: `translateX(${tX})${sc}`
                    }}
                    onMouseEnter={() => setHoverEntryId(e.id)}
                    onMouseLeave={() => setHoverEntryId(null)}
                  >{inner}</div>
                )
              })}
            </div>
          )
        })()}
        {hover && (() => {
          const xPct = (hover.x / W) * 100
          const isWeekly = MODE === 'weekly'
          const raw = hover.data.raw
          const stats = isWeekly ? (weeklyStats[hover.data.date] || {}) : null
          // Простое центрирование на точке + clamp по краям так, чтобы тултип не
          // вылазил за пределы видимой области. Богатый weekly-тултип шире —
          // ему нужен более внутренний clamp.
          const clampMin = isWeekly ? 28 : 14
          const clampMax = isWeekly ? 72 : 86
          const clamped = Math.max(clampMin, Math.min(clampMax, xPct))
          return (
          <div
            className={`trend-tooltip ${isWeekly ? 'trend-tooltip-rich' : ''}`}
            style={{
              left: `${clamped}%`,
              top: `${(hover.y / H) * 100}%`,
              transform: 'translate(-50%, calc(-100% - 10px))'
            }}
          >
            {isWeekly ? (() => {
              // Дельта к предыдущей неделе (если она есть в выборке)
              const prevPoint = hoverIdx > 0 ? points[hoverIdx - 1] : null
              const avgDelta = prevPoint ? (hover.data.avg - prevPoint.avg) : null
              // Карта group_id → prev avg для дельт по группам
              const prevGroupAvg = new Map()
              if (prevPoint?.raw?.groupAverages) {
                for (const g of prevPoint.raw.groupAverages) prevGroupAvg.set(g.groupId, g.avg)
              }
              function fmtDelta(d) {
                if (d == null) return null
                if (Math.abs(d) < 0.1) return { sign: '=', txt: '', cls: 'tt-d-stable' }
                const sign = d > 0 ? '↑' : '↓'
                const cls = d > 0 ? 'tt-d-up' : 'tt-d-down'
                return { sign, txt: ` ${d > 0 ? '+' : ''}${d.toFixed(1)}`, cls }
              }
              const overallD = fmtDelta(avgDelta)
              return (
              <>
                <div className="tt-header">
                  {formatDateLabel(hover.data.date)} — {formatDateLabel(raw.weekEnd)}
                </div>
                <div className="tt-main">
                  <span className="tt-big">{hover.data.avg.toFixed(2)}</span>
                  <span className="tt-of">/ 10</span>
                  {overallD && (
                    <span className={`tt-delta ${overallD.cls}`}>
                      {overallD.sign}{overallD.txt}
                    </span>
                  )}
                </div>
                <div className="tt-sub">
                  {raw.ratingsCnt} {ruPlural(raw.ratingsCnt, 'оценка', 'оценки', 'оценок')} · {raw.daysCnt} {ruPlural(raw.daysCnt, 'день', 'дня', 'дней')} с оценками
                </div>
                {raw.daysCnt < 3 && (
                  <div className="tt-low-sample">⚠ малая выборка — среднее ненадёжно</div>
                )}
                {raw.groupAverages?.length > 0 && (
                  <>
                    <div className="tt-divider" />
                    {raw.groupAverages.map(g => {
                      const gD = fmtDelta(prevGroupAvg.has(g.groupId) ? g.avg - prevGroupAvg.get(g.groupId) : null)
                      return (
                        <div key={g.groupId} className="tt-group">
                          <span className="tt-group-dot" style={{ background: g.color }} />
                          <span className="tt-group-name">{g.name}</span>
                          <span className="tt-group-val">{g.avg.toFixed(1)}</span>
                          {gD && (
                            <span className={`tt-group-delta ${gD.cls}`}>{gD.sign}{gD.txt}</span>
                          )}
                        </div>
                      )
                    })}
                  </>
                )}
              </>
              )
            })() : (
              <>
                <div className="trend-tooltip-value">{hover.data.avg.toFixed(2)}</div>
                <div className="trend-tooltip-date">{formatDateLabel(hover.data.date)}</div>
              </>
            )}
          </div>
          )
        })()}

        {/* Тултип одной записи под маркером */}
        {showEntries && hoverEntryId && points.length > 0 && (() => {
          let target = null
          for (const [, entries] of entryMap) {
            const found = (entries || []).find(e => e.id === hoverEntryId)
            if (found) { target = found; break }
          }
          if (!target) return null
          // То же индекс-based позиционирование как у самих маркеров — иначе тултип
          // прилетит в другое место графика.
          const dt = new Date(target.ts)
          const localISO = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
          const dateIndexMap2 = new Map()
          points.forEach((p, i) => dateIndexMap2.set(p.date, i))
          const idx = dateIndexMap2.get(localISO)
          if (idx === undefined) return null
          const baseX = PAD_L + (points.length <= 1 ? innerW / 2 : (idx / (points.length - 1)) * innerW)
          const slotW2 = points.length >= 2 ? innerW / (points.length - 1) : innerW
          const hourFrac = (dt.getHours() + dt.getMinutes() / 60) / 24
          const x = baseX + (hourFrac - 0.5) * slotW2 * 0.4
          const hh = String(dt.getHours()).padStart(2, '0')
          const mm = String(dt.getMinutes()).padStart(2, '0')
          const dateLabel = formatDateLabel(
            `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
          )
          const xPctTT = (x / W) * 100
          const tXTT = xPctTT < 25 ? '0%' : xPctTT > 75 ? '-100%' : '-50%'
          return (
            <div
              className="trend-entries-tooltip"
              style={{
                left: `${xPctTT}%`,
                bottom: '12px',
                transform: `translateX(${tXTT})`
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
        </div>{/* /.trend-scroll */}
      </div>{/* /.trend-svg-wrap */}

      <ShareDialog
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        targetRef={blockRef}
        filenameStem={`fresh-mind-dynamics-${PERIOD_LABEL[trendDays] || trendDays + 'd'}-${todayISO()}`}
        title="Скачать график динамики"
        defaultSize="og"
        defaultBackground="white"
      />
    </div>
  )
}
