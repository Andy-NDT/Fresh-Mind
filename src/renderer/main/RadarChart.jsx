import React, { useEffect, useMemo, useRef, useState } from 'react'
import ShareDialog from '../shared/ShareDialog.jsx'
import sfxUrl from '../shared/tap.wav'
import './RadarChart.css'

const SIZE = 600
const CX = SIZE / 2
const CY = SIZE / 2
const R = 205              // внешний радиус радара (паутинка/клины)
const R_HUB = 240          // радиус центра внешних кругов-меток сфер
const HUB_R = 28           // радиус самого круга-метки сферы (имя внутри)
const NODE_R = 12          // радиус точки оценки на паутинке (число внутри)
const RING_VALUES = [2, 4, 6, 8, 10]
const SCALE_MAX = 10
const WEB_COLOR = '#9B7BD9'

// Порядок групп по квадрантам (по часовой от верх-лево):
// Здоровье → Общество → Труд → Развитие
const RADAR_GROUP_ORDER = ['Здоровье', 'Общество', 'Труд', 'Развитие']

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftDate(iso, deltaDays) {
  const [y, m, d] = iso.split('-').map(Number)
  const nx = new Date(y, m - 1, d + deltaDays)
  return `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, '0')}-${String(nx.getDate()).padStart(2, '0')}`
}

// Угол для сферы i (0..total-1): центр 18°-сегмента,
// первая сфера начинается слева (9 часов = -180°)
function angleRad(i, total) {
  return (-180 + (i + 0.5) * (360 / total)) * (Math.PI / 180)
}


// Точка на радаре по индексу и значению
function point(i, total, value) {
  const a = angleRad(i, total)
  const r = R * (value / SCALE_MAX)
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
}

// SVG-path сектора (стартовый и конечный угол в радианах, опц. свой радиус)
function sectorPath(a1, a2, rOuter = R) {
  const x1 = CX + rOuter * Math.cos(a1)
  const y1 = CY + rOuter * Math.sin(a1)
  const x2 = CX + rOuter * Math.cos(a2)
  const y2 = CY + rOuter * Math.sin(a2)
  return `M ${CX},${CY} L ${x1.toFixed(2)},${y1.toFixed(2)} A ${rOuter},${rOuter} 0 0 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`
}

// Donut-полоса от rInner до rOuter в углах a1..a2
function bandPath(rInner, rOuter, a1, a2) {
  const xo1 = CX + rOuter * Math.cos(a1)
  const yo1 = CY + rOuter * Math.sin(a1)
  const xo2 = CX + rOuter * Math.cos(a2)
  const yo2 = CY + rOuter * Math.sin(a2)
  const xi2 = CX + rInner * Math.cos(a2)
  const yi2 = CY + rInner * Math.sin(a2)
  const xi1 = CX + rInner * Math.cos(a1)
  const yi1 = CY + rInner * Math.sin(a1)
  return `M ${xo1.toFixed(2)},${yo1.toFixed(2)} A ${rOuter},${rOuter} 0 0 1 ${xo2.toFixed(2)},${yo2.toFixed(2)} L ${xi2.toFixed(2)},${yi2.toFixed(2)} A ${rInner},${rInner} 0 0 0 ${xi1.toFixed(2)},${yi1.toFixed(2)} Z`
}

export default function RadarChart({ date: dateProp, onDateChange, onSphereDetail, isComparing = false, onCompareToggle, compact = false, hideHint = false, refreshSignal = 0, comparePresets = false, onComparePreset, onRatingChanged }) {
  const today = todayISO()
  const date = dateProp || today
  const [spheres, setSpheres] = useState([])
  const [groups, setGroups] = useState([])
  const [ratings, setRatings] = useState({}) // sphereId -> value
  const [activeSphereId, setActiveSphereId] = useState(null)
  const [hoverValue, setHoverValue] = useState(null)
  const [undoStack, setUndoStack] = useState([])
  const [flashSphereId, setFlashSphereId] = useState(null)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [shareOpen, setShareOpen] = useState(false)
  const svgRef = useRef(null)
  const sfxRef = useRef(null)
  const isToday = date === today

  useEffect(() => {
    const audio = new Audio(sfxUrl)
    audio.volume = 0.4
    audio.preload = 'auto'
    sfxRef.current = audio
    if (window.freshMind && window.freshMind.getSettings) {
      window.freshMind.getSettings().then(s => {
        setSoundEnabled(s?.soundEnabled !== false)
      })
    }
  }, [])

  function playSfx() {
    if (!soundEnabled) return
    const a = sfxRef.current
    if (!a) return
    try { a.currentTime = 0 } catch {}
    a.play().catch(() => {})
  }

  useEffect(() => {
    if (flashSphereId == null) return
    const t = setTimeout(() => setFlashSphereId(null), 700)
    return () => clearTimeout(t)
  }, [flashSphereId])

  function changeDate(next) {
    setUndoStack([])
    if (onDateChange) onDateChange(next)
  }

  async function undo() {
    if (!undoStack.length) return
    const last = undoStack[undoStack.length - 1]
    setUndoStack(s => s.slice(0, -1))
    if (last.prev == null) {
      await window.freshMind.deleteRating(last.sphereId, date)
    } else {
      await window.freshMind.saveRating(last.sphereId, date, last.prev, null, null)
    }
    await reload()
  }

  async function reload() {
    const [sphs, grps, rs] = await Promise.all([
      window.freshMind.getSpheres(),
      window.freshMind.getGroups(),
      window.freshMind.getRatingsForDate(date)
    ])
    const visible = (sphs || []).filter(s => !s.archived)
    setSpheres(visible)
    setGroups(grps || [])
    const map = {}
    for (const r of rs || []) map[r.sphere_id] = r.value
    setRatings(map)
  }

  useEffect(() => { reload() }, [date, refreshSignal])

  // Close radial input on click outside SVG
  useEffect(() => {
    if (activeSphereId == null) return
    function handleOutside(e) {
      if (svgRef.current && !svgRef.current.contains(e.target)) {
        setActiveSphereId(null)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [activeSphereId])

  async function setSphereRating(sphereId, value) {
    playSfx()
    const prev = ratings[sphereId]
    setUndoStack(s => [...s.slice(-9), { sphereId, prev }])
    setFlashSphereId(sphereId)
    await window.freshMind.saveRating(sphereId, date, value, null, null)
    await reload()
    if (onRatingChanged) onRatingChanged()
  }

  async function clearSphereRating(sphereId) {
    const prev = ratings[sphereId]
    if (prev == null) { setActiveSphereId(null); return }
    playSfx()
    setUndoStack(s => [...s.slice(-9), { sphereId, prev }])
    await window.freshMind.deleteRating(sphereId, date)
    await reload()
    setActiveSphereId(null)
    if (onRatingChanged) onRatingChanged()
  }

  // Сферы упорядочены по RADAR_GROUP_ORDER (Здоровье → Общество → Труд → Развитие).
  // Внутри группы — по sort_order из БД (настраивается пользователем в Настройках).
  // Берём по 5 сфер на группу.
  const ordered = useMemo(() => {
    if (!spheres.length || !groups.length) return []
    const groupByName = new Map(groups.map(g => [g.name?.trim(), g]))
    const result = []
    for (const groupName of RADAR_GROUP_ORDER) {
      const g = groupByName.get(groupName)
      if (!g) continue
      const inGroup = spheres
        .filter(s => s.group_id === g.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .slice(0, 5)
      result.push(...inGroup)
    }
    return result
  }, [spheres, groups])

  const total = ordered.length
  if (!total) {
    return <div className="radar-empty fm-pulse">Загружаем колесо</div>
  }

  // Точки паутинки (если оценки нет — берём 0, чтобы полигон замкнулся)
  const webPoints = ordered
    .map((s, i) => point(i, total, ratings[s.id] ?? 0).join(','))
    .join(' ')

  // Сектора групп: по квадрантам, в порядке RADAR_GROUP_ORDER
  const groupSectors = []
  for (let k = 0; k < RADAR_GROUP_ORDER.length; k++) {
    const name = RADAR_GROUP_ORDER[k]
    const g = groups.find(x => x.name === name)
    if (!g) continue
    const count = ordered.filter(s => s.group_id === g.id).length
    if (count === 0) continue
    const a1 = (-180 + k * 90) * (Math.PI / 180)
    const a2 = (-180 + (k + 1) * 90) * (Math.PI / 180)
    groupSectors.push({ ...g, k, count, a1, a2 })
  }

  // Радиальные разделители на границах квадрантов: -180°, -90°, 0°, 90°
  const groupBoundaries = [-180, -90, 0, 90].map(deg => {
    const a = deg * (Math.PI / 180)
    return [CX + R * Math.cos(a), CY + R * Math.sin(a)]
  })

  return (
    <div className={`radar-chart ${compact ? 'radar-compact' : ''}`}>
      <svg ref={svgRef} viewBox={`0 0 ${SIZE} ${SIZE}`} className="radar-svg" preserveAspectRatio="xMidYMid meet">
        {/* Цветные клинья — каждый под свою сферу. Активный — 10 полос для оценки */}
        <g className="radar-sphere-sectors">
          {ordered.map((s, i) => {
            const a1 = angleRad(i - 0.5, total)
            const a2 = angleRad(i + 0.5, total)
            const isActive = activeSphereId === s.id
            const isDim = activeSphereId != null && !isActive

            if (isActive) {
              // Активный сектор отрисовывается отдельной группой radar-active-bands ниже
              return null
            }

            return (
              <path
                key={s.id}
                d={sectorPath(a1, a2)}
                fill={s.color}
                opacity={isDim ? 0.12 : 0.30}
                className="radar-sphere-clin"
                onClick={() => setActiveSphereId(s.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setActiveSphereId(null)
                  if (onSphereDetail) onSphereDetail(s.id)
                }}
                style={{ cursor: 'pointer' }}
              />
            )
          })}
        </g>

        {/* Радиальные разделители групп */}
        <g className="radar-boundaries">
          {groupBoundaries.map(([x, y], i) => (
            <line
              key={i}
              x1={CX} y1={CY} x2={x} y2={y}
              stroke="#fff"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ))}
        </g>

        {/* Концентрические кольца */}
        <g className="radar-rings">
          {RING_VALUES.map(v => (
            <circle
              key={v}
              cx={CX}
              cy={CY}
              r={R * (v / SCALE_MAX)}
              fill="none"
              stroke="rgba(155, 123, 217, 0.18)"
              strokeWidth="1"
              strokeDasharray={v === SCALE_MAX ? '' : '3 3'}
            />
          ))}
        </g>

        {/* Лучи-разделители — едва видимы между сферами, не на границах групп */}
        <g className="radar-spokes">
          {ordered.map((s, i) => {
            // Линия идёт между сферой i и i+1 → угол angle(i + 0.5)
            // Если эта линия совпадает с границей квадранта — пропускаем (она уже белая)
            const fracInGroup = (i + 1) % (total / 4)
            if (fracInGroup === 0) return null
            const a = angleRad(i + 0.5, total)
            const x = CX + R * Math.cos(a)
            const y = CY + R * Math.sin(a)
            return (
              <line
                key={s.id}
                x1={CX} y1={CY} x2={x} y2={y}
                stroke="rgba(155, 123, 217, 0.10)"
                strokeWidth="1"
              />
            )
          })}
        </g>

        {/* Паутинка */}
        <polygon
          className="radar-web"
          points={webPoints}
          fill="rgba(155, 123, 217, 0.35)"
          stroke={WEB_COLOR}
          strokeOpacity="0.7"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />

        {/* Узлы — точки оценок на паутинке, с числом внутри. Скрываем для активной.
            cx/cy анимируются через CSS — плавный bounce при смене оценки/даты. */}
        <g className="radar-nodes" pointerEvents="none">
          {ordered.map((s, i) => {
            if (s.id === activeSphereId) return null
            const value = ratings[s.id]
            if (value == null || value === 0) return null
            const [x, y] = point(i, total, value)
            const isFlash = flashSphereId === s.id
            return (
              <g key={s.id} className={`radar-node-g ${isFlash ? 'is-flash' : ''}`}>
                <circle
                  cx={x} cy={y} r={NODE_R}
                  fill={s.color}
                  stroke="#fff"
                  strokeWidth="2"
                  className="radar-node-circle"
                />
                <text
                  x={x} y={y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="radar-node-num"
                >{value}</text>
              </g>
            )
          })}
        </g>

        {/* Полосы активной сферы — ПОВЕРХ паутинки и узлов */}
        {activeSphereId != null && (() => {
          const idx = ordered.findIndex(s => s.id === activeSphereId)
          if (idx < 0) return null
          const s = ordered[idx]
          const a1 = angleRad(idx - 0.5, total)
          const a2 = angleRad(idx + 0.5, total)
          const currentValue = ratings[s.id]
          const previewMax = hoverValue ?? currentValue ?? 0
          return (
            <g
              className="radar-active-bands"
              onMouseLeave={() => setHoverValue(null)}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setActiveSphereId(null)
                if (onSphereDetail) onSphereDetail(s.id)
              }}
            >
              {/* 10 полос для значений 1..10. Band «1» — самая центральная (от 0). */}
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => {
                const rIn = v === 1 ? 0 : R * (v - 1) / 10
                const rOut = R * v / 10
                const isFilled = v <= previewMax
                const isTarget = v === hoverValue
                const opacity = isTarget ? 0.95 : isFilled ? 0.78 : 0.22
                return (
                  <path
                    key={v}
                    d={v === 1 ? sectorPath(a1, a2, rOut) : bandPath(rIn, rOut, a1, a2)}
                    fill={s.color}
                    opacity={opacity}
                    stroke="#fff"
                    strokeWidth="1.5"
                    onClick={() => setSphereRating(s.id, v)}
                    onMouseEnter={() => setHoverValue(v)}
                    style={{ cursor: 'pointer', transition: 'opacity 100ms' }}
                  />
                )
              })}
            </g>
          )
        })()}


        {/* Внешние круги-метки сфер: имя ВНУТРИ круга */}
        <g className="radar-hubs">
          {ordered.map((s, i) => {
            const a = angleRad(i, total)
            const hubX = CX + R_HUB * Math.cos(a)
            const hubY = CY + R_HUB * Math.sin(a)
            const isActive = activeSphereId === s.id
            const name = (s.name || '').toUpperCase()
            // Сжимаем длинные слова через textLength, чтобы вписать в круг
            const textLengthAttr = name.length >= 8 ? (HUB_R * 2 - 6) : undefined
            return (
              <g
                key={s.id}
                className="radar-hub-g"
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setActiveSphereId(null)
                  if (onSphereDetail) onSphereDetail(s.id)
                }}
                onClick={() => setActiveSphereId(prev => prev === s.id ? null : s.id)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={hubX} cy={hubY} r={HUB_R}
                  fill={s.color}
                  stroke="#fff"
                  strokeWidth={isActive ? 3 : 2}
                  className={`radar-hub-circle ${isActive ? 'on' : ''}`}
                />
                <text
                  x={hubX} y={hubY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="radar-hub-name"
                  {...(textLengthAttr ? { textLength: textLengthAttr, lengthAdjust: 'spacingAndGlyphs' } : {})}
                >{name}</text>
              </g>
            )
          })}
        </g>
      </svg>

      {!hideHint && (
        <div className="radar-hint">
          {activeSphereId
            ? 'выбери уровень от центра · ↶ отменить'
            : Object.keys(ratings).length === 0
              ? 'нажми на любую сферу, чтобы поставить первую оценку'
              : 'ЛКМ — оценка · ПКМ — детали'}
        </div>
      )}
      <div className="radar-meta">
        <div className="radar-datebar">
          <button
            className="radar-datepicker"
            onClick={(e) => {
              const bar = e.currentTarget.parentElement
              const inp = bar.querySelector('input[type="date"]')
              if (inp && inp.showPicker) inp.showPicker()
              else if (inp) inp.focus()
            }}
            title="Открыть календарь"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6"/>
              <path d="M3 9h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
          <button
            className="radar-datebtn"
            onClick={() => changeDate(shiftDate(date, -1))}
            title="Предыдущий день"
          >‹</button>
          <input
            type="date"
            className="radar-dateinput"
            value={date}
            max={today}
            onChange={(e) => e.target.value && changeDate(e.target.value)}
          />
          <button
            className="radar-datebtn"
            onClick={() => changeDate(shiftDate(date, 1))}
            disabled={isToday}
            title="Следующий день"
          >›</button>
          <button
            className="radar-dateundo"
            onClick={undo}
            disabled={undoStack.length === 0}
            title={undoStack.length === 0
              ? 'Нечего отменять'
              : `Отменить оценку${undoStack.length > 1 ? ` (в очереди: ${undoStack.length})` : ''}`}
          >↶</button>
        </div>
        <div className="radar-datebar-secondary">
          {!isToday && (
            <button
              className="radar-datetoday"
              onClick={() => changeDate(today)}
              title="Сегодня"
            >сегодня</button>
          )}
          {onCompareToggle && !comparePresets && (
            <button
              className={`radar-datecompare ${isComparing ? 'on' : ''}`}
              onClick={onCompareToggle}
              title={isComparing ? 'Выйти из сравнения' : 'Сравнить с другим днём'}
            >
              {isComparing ? '× сравнение' : '⇆ сравнить'}
            </button>
          )}
          {!comparePresets && !isComparing && (
            <button
              className="radar-dateshare"
              onClick={() => setShareOpen(true)}
              title="Скачать колесо как картинку"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
              </svg>
            </button>
          )}
          {comparePresets && onComparePreset && (
            <span className="radar-datepresets">
              <button className="radar-datepreset" onClick={() => onComparePreset(1)} title="A − 1 день">вчера</button>
              <button className="radar-datepreset" onClick={() => onComparePreset(7)} title="A − 7 дней">−7 дн</button>
              <button className="radar-datepreset" onClick={() => onComparePreset(30)} title="A − 30 дней">−30 дн</button>
              <button className="radar-datepreset" onClick={() => onComparePreset(365)} title="A − 365 дней">−1 год</button>
            </span>
          )}
        </div>
      </div>
      <ShareDialog
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        targetRef={svgRef}
        filenameStem={`fresh-mind-radar-${date}`}
        title="Скачать колесо за день"
        defaultSize="square"
        defaultBackground="white"
      />
    </div>
  )
}
