import React, { useEffect, useMemo, useRef, useState } from 'react'
import './EntryFeed.css'

const PAGE_SIZE = 20
// Защита от тормозов при большом архиве: «Развернуть все» разворачивает
// не сразу всё, а только N самых свежих месяцев. Остальные раскрываются вручную.
const EXPAND_ALL_LIMIT = 12
// Лимит карточек на один месяц (если месяц >LIMIT, остальные доступны по кнопке)
const ENTRIES_PER_MONTH = 30

const MOOD_QUICK = [
  '😭', '😩', '😢', '😞', '😠', '😤', '😟', '😨',
  '😕', '😐', '🤔', '🎯', '🙂', '😌', '😊', '🤩'
]

function formatDateTime(ts) {
  const d = new Date(ts)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today.getTime() - 86400000)
  const entryDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

  if (entryDay === today.getTime()) return `сегодня, ${time}`
  if (entryDay === yesterday.getTime()) return `вчера, ${time}`
  const months = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек']
  const yearSuffix = d.getFullYear() === today.getFullYear() ? '' : ` ${d.getFullYear()}`
  return `${d.getDate()} ${months[d.getMonth()]}${yearSuffix}, ${time}`
}

function previewFromText(text, maxChars = 220) {
  if (!text) return ''
  // Сжимаем только горизонтальные пробелы/табы, СОХРАНЯЕМ переводы строк (абзацы).
  // Подряд идущие пустые строки нормализуем до одной пустой между абзацами.
  const cleaned = text
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (cleaned.length <= maxChars) return cleaned
  return cleaned.slice(0, maxChars - 1).trimEnd() + '…'
}

function highlightHashtags(text) {
  if (!text) return null
  const parts = text.split(/(#[\p{L}\p{N}_\-]+)/gu)
  return parts.map((part, i) =>
    /^#[\p{L}\p{N}_\-]+$/u.test(part)
      ? <span key={i} className="ef-hashtag">{part}</span>
      : <React.Fragment key={i}>{part}</React.Fragment>
  )
}

const MONTH_LABELS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

function formatMonthYear(ym) {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTH_LABELS[m - 1]} ${y}`
}

function extractImageUrls(html) {
  if (!html) return []
  const re = /<img[^>]+src="([^"]+)"/g
  const out = []
  let m
  while ((m = re.exec(html))) out.push(m[1])
  return out
}

// Картинка с fallback'ом если файл удалён или недоступен.
function SafeImage({ src, className, ...rest }) {
  const [broken, setBroken] = useState(false)
  if (broken) {
    return (
      <div className={`${className || ''} ef-image-missing`} {...rest}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <path d="M21 15l-5-5L5 21"/>
        </svg>
        <span>файл не найден</span>
      </div>
    )
  }
  return <img src={src} className={className} onError={() => setBroken(true)} {...rest} />
}

function EntryCard({ entry, sphereGroups, onTogglePinned, onDelete, onSaveEdit, expanded, onToggleExpand, onOpenLightbox }) {
  const text = entry.content_text || ''
  const preview = expanded ? text : previewFromText(text)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [draftMood, setDraftMood] = useState(null)
  const [draftSphereIds, setDraftSphereIds] = useState(new Set())
  const taRef = useRef(null)

  function startEdit() {
    setDraft(text)
    setDraftMood(entry.mood_emoji || null)
    setDraftSphereIds(new Set((entry.spheres || []).map(s => s.id)))
    setEditing(true)
    setTimeout(() => {
      if (taRef.current) {
        taRef.current.focus()
        taRef.current.selectionStart = taRef.current.value.length
      }
    }, 30)
  }

  function cancelEdit() {
    setEditing(false)
    setDraft('')
    setDraftMood(null)
    setDraftSphereIds(new Set())
  }

  async function commitEdit() {
    await onSaveEdit(entry, { text: draft, mood: draftMood, sphereIds: [...draftSphereIds] })
    setEditing(false)
  }

  function onEditKeyDown(e) {
    // Enter — сохранить; Shift+Enter — перенос строки (стандартное поведение textarea)
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit() }
    else if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
  }

  function toggleSphere(id) {
    setDraftSphereIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className={`ef-card ${entry.pinned ? 'is-pinned' : ''} ${expanded ? 'is-expanded' : ''} ${editing ? 'is-editing' : ''}`}>
      <div className="ef-card-meta">
        <span className="ef-date">{formatDateTime(entry.created_at)}</span>
        {entry.mood_emoji && <span className="ef-mood">{entry.mood_emoji}</span>}
        {entry.pinned && (
          <span className="ef-pin-icon" title="Памятка">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2z"/></svg>
          </span>
        )}
        <span className="ef-meta-spacer" />
        {!editing && (
          <>
            <button
              className="ef-act"
              onClick={startEdit}
              title="Редактировать"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/>
              </svg>
            </button>
            <button
              className="ef-act"
              onClick={() => onTogglePinned(entry)}
              title={entry.pinned ? 'Открепить' : 'Закрепить'}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill={entry.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2z"/></svg>
            </button>
            <button
              className="ef-act ef-act-del"
              onClick={() => onDelete(entry)}
              title="В корзину"
            >×</button>
          </>
        )}
      </div>

      {editing && (
        <div className="ef-edit-topbar">
          <button className="ef-edit-btn ef-edit-cancel" onClick={cancelEdit} title="Esc">Отмена</button>
          <button className="ef-edit-btn ef-edit-save" onClick={commitEdit} title="Enter">Сохранить</button>
        </div>
      )}

      {entry.spheres && entry.spheres.length > 0 && !editing && (
        <div className="ef-spheres">
          {entry.spheres.map(s => (
            <span key={s.id} className="ef-sphere-chip" style={{ borderColor: s.color, background: s.color + '22' }}>
              <span className="ef-sphere-dot" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}

      {editing ? (
        <>
          <textarea
            ref={taRef}
            className="ef-edit-textarea"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onEditKeyDown}
            rows={Math.min(20, Math.max(3, draft.split('\n').length + 1))}
          />

          {/* Mood picker */}
          <div className="ef-edit-mood-row">
            <div className="ef-edit-mood-label">
              <span>Настроение</span>
              {draftMood && (
                <button className="ef-edit-mood-clear" onClick={() => setDraftMood(null)} title="Убрать">×</button>
              )}
            </div>
            <div className="ef-edit-mood-grid">
              {MOOD_QUICK.map(em => (
                <button
                  key={em}
                  className={`ef-edit-mood ${draftMood === em ? 'on' : ''}`}
                  onClick={() => setDraftMood(draftMood === em ? null : em)}
                  title={draftMood === em ? 'Убрать настроение' : 'Выбрать настроение'}
                >{em}</button>
              ))}
              {draftMood && !MOOD_QUICK.includes(draftMood) && (
                <button className="ef-edit-mood on" onClick={() => setDraftMood(null)} title="Убрать настроение">{draftMood}</button>
              )}
            </div>
          </div>

          {/* Sphere groups */}
          {sphereGroups && sphereGroups.length > 0 && (
            <div className="ef-edit-spheres">
              {sphereGroups.map(g => {
                const inGroupOn = g.spheres.filter(s => draftSphereIds.has(s.id)).length
                return (
                  <div
                    key={g.name}
                    className={`qc-sphere-group ${inGroupOn > 0 ? 'has-active' : ''}`}
                    style={{ '--group-color': g.color }}
                  >
                    <div className="qc-sphere-group-header">
                      {g.name}
                      {inGroupOn > 0 && <span className="qc-sphere-group-count"> · {inGroupOn}</span>}
                    </div>
                    <div className="qc-sphere-row">
                      {g.spheres.map(s => {
                        const on = draftSphereIds.has(s.id)
                        return (
                          <span key={s.id} className="qc-sphere-chip-wrap">
                            <button
                              className={`qc-sphere-chip ${on ? 'on' : ''}`}
                              style={on ? { background: s.color, borderColor: s.color, color: 'white' } : null}
                              onClick={() => toggleSphere(s.id)}
                              title={s.name}
                            >
                              <span className="qc-sphere-dot" style={{ background: s.color }} />
                              {s.name}
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </>
      ) : (
        <>
          <button
            className="ef-card-body"
            onClick={onToggleExpand}
            title={expanded ? 'Свернуть' : 'Развернуть'}
          >
            {preview ? highlightHashtags(preview) : <em className="ef-empty-text">пустая запись</em>}
          </button>
          {(() => {
            const imgs = extractImageUrls(entry.content_html)
            if (!imgs.length) return null
            const visible = expanded ? imgs : imgs.slice(0, 3)
            const moreCount = expanded ? 0 : Math.max(0, imgs.length - 3)
            return (
              <div className={`ef-images ${expanded ? 'is-expanded' : ''}`}>
                {visible.map((src, i) => {
                  const isLast = i === visible.length - 1
                  const showBadge = !expanded && isLast && moreCount > 0
                  return (
                    <div
                      key={src + i}
                      className="ef-image-wrap"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        if (expanded && onOpenLightbox) onOpenLightbox(src)
                        else onToggleExpand()
                      }}
                    >
                      <SafeImage src={src} alt="" className="ef-image" />
                      {showBadge && <div className="ef-image-badge">+{moreCount}</div>}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </>
      )}

      {entry.tags && entry.tags.length > 0 && !editing && (
        <div className="ef-tags">
          {entry.tags.map(t => <span key={t} className="ef-tag">#{t}</span>)}
        </div>
      )}
    </div>
  )
}

export default function EntryFeed({ refreshKey = 0 }) {
  const [entries, setEntries] = useState([])
  const [spheres, setSpheres] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [expandedId, setExpandedId] = useState(null)
  const [search, setSearch] = useState('')
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dateFilterOpen, setDateFilterOpen] = useState(false)
  const dateFilterRef = useRef(null)
  const [lightboxSrc, setLightboxSrc] = useState(null)
  const [selectedYear, setSelectedYear] = useState(null) // null = все годы
  const [collapsedMonths, setCollapsedMonths] = useState(() => new Set())
  const monthsInitRef = useRef(false)

  useEffect(() => {
    if (!lightboxSrc) return
    function onKey(e) { if (e.key === 'Escape') setLightboxSrc(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightboxSrc])

  async function reload() {
    setLoading(true)
    const rows = await window.freshMind.listEntries({ limit, offset: 0, includeDeleted: false })
    setEntries(rows || [])
    setLoading(false)
  }

  useEffect(() => {
    Promise.all([
      window.freshMind.getSpheres(),
      window.freshMind.getGroups()
    ]).then(([ss, gs]) => {
      setSpheres((ss || []).filter(s => !s.archived))
      setGroups(gs || [])
    })
  }, [refreshKey])

  useEffect(() => { reload() }, [limit, refreshKey])

  const sphereGroups = useMemo(() => {
    if (!groups.length) return []
    const RADAR_GROUP_ORDER = ['Здоровье', 'Общество', 'Труд', 'Развитие']
    const byName = new Map(groups.map(g => [g.name?.trim(), g]))
    const result = []
    for (const groupName of RADAR_GROUP_ORDER) {
      const g = byName.get(groupName)
      if (!g) continue
      const inGroup = spheres
        .filter(s => s.group_id === g.id)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      result.push({ name: g.name, color: g.color, spheres: inGroup })
    }
    return result
  }, [spheres, groups])

  const totalPinned = useMemo(() => entries.filter(e => e.pinned).length, [entries])

  // Доступные годы по реальным данным
  const availableYears = useMemo(() => {
    const set = new Set()
    for (const e of entries) set.add(new Date(e.created_at).getFullYear())
    return [...set].sort((a, b) => b - a)
  }, [entries])

  const { pinned, regular } = useMemo(() => {
    let filtered = entries
    if (pinnedOnly) filtered = filtered.filter(e => e.pinned)
    if (selectedYear) {
      filtered = filtered.filter(e => new Date(e.created_at).getFullYear() === selectedYear)
    }
    if (dateFrom || dateTo) {
      const fromMs = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : 0
      const toMs = dateTo ? new Date(dateTo + 'T23:59:59.999').getTime() : Number.POSITIVE_INFINITY
      filtered = filtered.filter(e => e.created_at >= fromMs && e.created_at <= toMs)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter(e => {
        if ((e.content_text || '').toLowerCase().includes(q)) return true
        if (e.tags && e.tags.some(t => t.toLowerCase().includes(q))) return true
        if (e.spheres && e.spheres.some(s => s.name.toLowerCase().includes(q))) return true
        return false
      })
    }
    return {
      pinned: filtered.filter(e => e.pinned),
      regular: filtered.filter(e => !e.pinned)
    }
  }, [entries, search, pinnedOnly, selectedYear, dateFrom, dateTo])

  // Закрывать popover при клике вне него
  useEffect(() => {
    if (!dateFilterOpen) return
    function onMouseDown(e) {
      if (dateFilterRef.current && !dateFilterRef.current.contains(e.target)) {
        setDateFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [dateFilterOpen])

  // Группировка обычных записей по «YYYY-MM», новые группы сверху
  const groupedByMonth = useMemo(() => {
    const map = new Map()
    for (const e of regular) {
      const d = new Date(e.created_at)
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!map.has(ym)) map.set(ym, [])
      map.get(ym).push(e)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [regular])

  // По первой загрузке: разворачиваем только самый свежий месяц, остальные сворачиваем
  useEffect(() => {
    if (monthsInitRef.current) return
    if (groupedByMonth.length === 0) return
    monthsInitRef.current = true
    if (groupedByMonth.length > 1) {
      setCollapsedMonths(new Set(groupedByMonth.slice(1).map(([ym]) => ym)))
    }
  }, [groupedByMonth.length])

  function toggleMonth(ym) {
    setCollapsedMonths(prev => {
      const next = new Set(prev)
      if (next.has(ym)) next.delete(ym); else next.add(ym)
      return next
    })
  }

  function expandAllMonths() {
    // Раскрываем только N последних месяцев — остальные оставляем свёрнутыми
    // чтобы не рендерить сотни карточек разом.
    const keepCollapsed = groupedByMonth.slice(EXPAND_ALL_LIMIT).map(([ym]) => ym)
    setCollapsedMonths(new Set(keepCollapsed))
  }
  function collapseAllMonths() {
    setCollapsedMonths(new Set(groupedByMonth.map(([ym]) => ym)))
  }

  // Per-month «показать ещё» (если в одном месяце много записей)
  const [showFullMonth, setShowFullMonth] = useState(new Set())
  function toggleFullMonth(ym) {
    setShowFullMonth(prev => {
      const next = new Set(prev)
      if (next.has(ym)) next.delete(ym); else next.add(ym)
      return next
    })
  }

  async function togglePinned(entry) {
    await window.freshMind.saveEntry({ ...entry, pinned: !entry.pinned, content_json: entry.content_json })
    await reload()
  }

  async function deleteEntry(entry) {
    if (!confirm('Удалить запись? Можно восстановить позже из корзины.')) return
    // softDeleteEntry только проставляет deleted_at = now() в БД.
    // ФАЙЛЫ ВЛОЖЕНИЙ ИЗ /attachments/ НЕ УДАЛЯЮТСЯ — окончательное удаление будет
    // в шаге 12 (Корзина) с явной кнопкой «удалить навсегда».
    await window.freshMind.softDeleteEntry(entry.id)
    await reload()
  }

  // Сохраняет правку: текст + эмодзи настроения + связь со сферами.
  // Хэштеги пере-извлекаются из текста. Численные оценки сфер (из ratings) не трогаем.
  async function saveEdit(entry, patch) {
    const { text: newText, mood, sphereIds } = patch
    const lines = newText.split('\n')
    const docJson = {
      type: 'doc',
      content: lines.map(line => ({
        type: 'paragraph',
        content: line ? [{ type: 'text', text: line }] : []
      }))
    }
    const html = lines.map(line => `<p>${(line || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`).join('')
    const re = /#([\p{L}\p{N}_\-]+)/gu
    const tags = new Set()
    let m
    while ((m = re.exec(newText))) tags.add(m[1].toLowerCase())
    // Подгружаем существующие ratings, чтобы не потерять их при сохранении
    // (saveEntry заменяет entry_spheres И rewires ratings — оставляем те же значения для тех же сфер).
    const sphere_ratings = (sphereIds || []).map(id => {
      const existing = (entry.spheres || []).find(s => s.id === id)
      return { sphere_id: id, value: existing && existing.value != null ? existing.value : 5 }
    })
    await window.freshMind.saveEntry({
      ...entry,
      content_text: newText,
      content_html: html,
      content_json: docJson,
      mood_emoji: mood || null,
      tags: [...tags],
      sphere_ratings
    })
    await reload()
  }

  const hasMore = entries.length >= limit
  const totalShown = pinned.length + regular.length

  return (
    <div className="entry-feed">
      <div className="ef-header">
        <input
          type="text"
          className="ef-search"
          placeholder="Поиск по записям, тегам, сферам…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button className="ef-search-clear" onClick={() => setSearch('')} title="Очистить">×</button>
        )}
        <button
          className={`ef-pin-filter ${pinnedOnly ? 'on' : ''}`}
          onClick={() => setPinnedOnly(v => !v)}
          title={pinnedOnly ? 'Показать все записи' : 'Только памятки'}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill={pinnedOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6">
            <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2z"/>
          </svg>
          {totalPinned > 0 && <span className="ef-pin-count">{totalPinned}</span>}
        </button>
        <div className="ef-date-filter" ref={dateFilterRef}>
          <button
            className={`ef-date-btn ${(dateFrom || dateTo) ? 'on' : ''}`}
            onClick={() => setDateFilterOpen(v => !v)}
            title={(dateFrom || dateTo)
              ? `Период: ${dateFrom || '…'} — ${dateTo || '…'}`
              : 'Фильтр по диапазону дат'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {(dateFrom || dateTo) && <span className="ef-date-dot" />}
          </button>
          {dateFilterOpen && (
            <div className="ef-date-popover">
              <div className="ef-date-row">
                <span className="ef-date-label">От</span>
                <input
                  type="date"
                  value={dateFrom}
                  min="2000-01-01"
                  max={dateTo || '9999-12-31'}
                  onChange={e => {
                    const v = e.target.value
                    // Ограничиваем год 4 цифрами (date-input может принять 5-6 цифр год — отсекаем)
                    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) setDateFrom(v)
                    else if (!v) setDateFrom('')
                  }}
                />
              </div>
              <div className="ef-date-row">
                <span className="ef-date-label">До</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || '2000-01-01'}
                  max="9999-12-31"
                  onChange={e => {
                    const v = e.target.value
                    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) setDateTo(v)
                    else if (!v) setDateTo('')
                  }}
                />
              </div>
              {(dateFrom || dateTo) && (
                <button
                  className="ef-date-reset"
                  onClick={() => { setDateFrom(''); setDateTo('') }}
                >Сбросить</button>
              )}
            </div>
          )}
        </div>
      </div>

      {loading && <div className="ef-loading fm-pulse">Загружаю записи</div>}

      {!loading && totalShown === 0 && (
        <div className="ef-empty">
          {search
            ? 'Ничего не найдено'
            : 'Тут будут твои записи. Начни с поля сверху.'}
        </div>
      )}

      {pinned.length > 0 && (
        <>
          <div className="ef-section-label">Памятки</div>
          <div className="ef-list">
            {pinned.map(e => (
              <EntryCard
                key={e.id}
                entry={e}
                sphereGroups={sphereGroups}
                onTogglePinned={togglePinned}
                onDelete={deleteEntry}
                onSaveEdit={saveEdit}
                expanded={expandedId === e.id}
                onToggleExpand={() => setExpandedId(expandedId === e.id ? null : e.id)}
                onOpenLightbox={setLightboxSrc}
              />
            ))}
          </div>
        </>
      )}

      {/* Год-табы появляются только если записи есть в более чем одном году */}
      {availableYears.length > 1 && regular.length > 0 && (
        <div className="ef-year-tabs">
          <button
            className={`ef-year-tab ${selectedYear === null ? 'on' : ''}`}
            onClick={() => setSelectedYear(null)}
          >Все</button>
          {availableYears.map(y => (
            <button
              key={y}
              className={`ef-year-tab ${selectedYear === y ? 'on' : ''}`}
              onClick={() => setSelectedYear(y)}
            >{y}</button>
          ))}
        </div>
      )}

      {groupedByMonth.length > 0 && (
        <>
          {pinned.length > 0 && <div className="ef-section-label">Все записи</div>}
          {groupedByMonth.length > 1 && (
            <div className="ef-month-tools">
              <button
                className="ef-month-tool"
                onClick={expandAllMonths}
                title={groupedByMonth.length > EXPAND_ALL_LIMIT
                  ? `Раскрыть ${EXPAND_ALL_LIMIT} последних месяцев`
                  : 'Развернуть все'}
              >
                {groupedByMonth.length > EXPAND_ALL_LIMIT
                  ? `▾ последние ${EXPAND_ALL_LIMIT}`
                  : '▾ все'}
              </button>
              <button className="ef-month-tool" onClick={collapseAllMonths} title="Свернуть все">▴ все</button>
            </div>
          )}
          {groupedByMonth.map(([ym, monthEntries]) => {
            const collapsed = collapsedMonths.has(ym)
            const overLimit = monthEntries.length > ENTRIES_PER_MONTH
            const showAll = showFullMonth.has(ym)
            const visibleEntries = overLimit && !showAll
              ? monthEntries.slice(0, ENTRIES_PER_MONTH)
              : monthEntries
            const hiddenInMonth = monthEntries.length - visibleEntries.length
            return (
              <div key={ym} className="ef-month-group">
                <button
                  className={`ef-month-header ${collapsed ? 'is-collapsed' : ''}`}
                  onClick={() => toggleMonth(ym)}
                >
                  <span className="ef-month-name">{formatMonthYear(ym)}</span>
                  <span className="ef-month-count">{monthEntries.length}</span>
                  <svg
                    className="ef-month-chevron"
                    width="10" height="10" viewBox="0 0 10 10"
                    style={{ transform: collapsed ? 'rotate(-90deg)' : '' }}
                  >
                    <path d="M2.5 3.5L5 6l2.5-2.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                {!collapsed && (
                  <div className="ef-list">
                    {visibleEntries.map(e => (
                      <EntryCard
                        key={e.id}
                        entry={e}
                        sphereGroups={sphereGroups}
                        onTogglePinned={togglePinned}
                        onDelete={deleteEntry}
                        onSaveEdit={saveEdit}
                        expanded={expandedId === e.id}
                        onToggleExpand={() => setExpandedId(expandedId === e.id ? null : e.id)}
                        onOpenLightbox={setLightboxSrc}
                      />
                    ))}
                    {hiddenInMonth > 0 && (
                      <button
                        className="ef-month-show-more"
                        onClick={() => toggleFullMonth(ym)}
                      >Показать ещё {hiddenInMonth} в этом месяце</button>
                    )}
                    {overLimit && showAll && (
                      <button
                        className="ef-month-show-more"
                        onClick={() => toggleFullMonth(ym)}
                      >Свернуть до {ENTRIES_PER_MONTH}</button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {hasMore && !search && (
        <button className="ef-load-more" onClick={() => setLimit(l => l + PAGE_SIZE)}>
          Показать ещё
        </button>
      )}

      {lightboxSrc && (
        <div className="ef-lightbox" onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} alt="" onClick={e => e.stopPropagation()} />
          <button className="ef-lightbox-close" onClick={() => setLightboxSrc(null)} title="Закрыть (Esc)">×</button>
        </div>
      )}
    </div>
  )
}
