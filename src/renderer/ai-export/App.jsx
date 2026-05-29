import React, { useEffect, useMemo, useRef, useState } from 'react'
import { PROMPTS, getPromptById } from './prompts.js'

// ── Утилиты дат ──────────────────────────────────────────────────────
function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shiftDateStr(iso, deltaDays) {
  const [y, m, d] = iso.split('-').map(Number)
  const nx = new Date(y, m - 1, d + deltaDays)
  return `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, '0')}-${String(nx.getDate()).padStart(2, '0')}`
}

function daysBetween(startISO, endISO) {
  const [y1, m1, d1] = startISO.split('-').map(Number)
  const [y2, m2, d2] = endISO.split('-').map(Number)
  const a = new Date(y1, m1 - 1, d1).getTime()
  const b = new Date(y2, m2 - 1, d2).getTime()
  return Math.round((b - a) / 86400000) + 1
}

function formatHumanDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря']
  return `${d} ${months[m - 1]} ${y}`
}

// ── Определения периодов ─────────────────────────────────────────────
const PERIOD_CHIPS = [
  { id: 'month',  label: 'Месяц',   days: 30  },
  { id: '3mo',    label: '3 мес',   days: 90  },
  { id: '6mo',    label: 'Полгода', days: 180 },
  { id: 'year',   label: 'Год',     days: 365 },
  { id: 'all',    label: 'Всё время', days: null },
  { id: 'custom', label: 'Свой диапазон', days: null }
]

const ALL_TIME_SENTINEL = '2000-01-01'

function periodHumanText(kind, start, end) {
  if (kind === 'month')  return 'за последний месяц'
  if (kind === '3mo')    return 'за последние 3 месяца'
  if (kind === '6mo')    return 'за последние полгода'
  if (kind === 'year')   return 'за последний год'
  if (kind === 'all')    return 'за всё время ведения дневника'
  return `за период ${formatHumanDate(start)} — ${formatHumanDate(end)}`
}

// ── Главный компонент ────────────────────────────────────────────────
export default function App() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const panelRef = useRef(null)

  const today = todayISO()

  // Период
  const [periodKind, setPeriodKind] = useState('3mo')
  const [customStart, setCustomStart] = useState(shiftDateStr(today, -29))
  const [customEnd, setCustomEnd]     = useState(today)

  // Выбор типа разбора
  const [promptId, setPromptId] = useState(null)

  // Параметры условных полей
  const [paramSphere, setParamSphere]           = useState('')
  const [paramQuestion, setParamQuestion]       = useState('')
  const [paramCompareStart, setParamCompareStart] = useState(shiftDateStr(today, -180))
  const [paramCustomText, setParamCustomText]   = useState('')

  // Внешние данные
  const [entriesCount, setEntriesCount] = useState(null)
  const [spheres, setSpheres] = useState([])
  const [firstEntryDate, setFirstEntryDate] = useState(null) // ISO самой ранней записи или null

  // ── Вычисляемые поля периода ──────────────────────────────────────
  const periodRange = useMemo(() => {
    if (periodKind === 'custom') return { start: customStart, end: customEnd }
    if (periodKind === 'all')    return { start: firstEntryDate || ALL_TIME_SENTINEL, end: today }
    const chip = PERIOD_CHIPS.find(c => c.id === periodKind)
    return { start: shiftDateStr(today, -(chip.days - 1)), end: today }
  }, [periodKind, customStart, customEnd, today, firstEntryDate])

  const customInvalid = periodKind === 'custom' && customStart > customEnd

  // Длина основного периода — нужна для compareDate
  const periodLengthDays = useMemo(() => {
    if (periodKind === 'all') return null
    return Math.max(1, daysBetween(periodRange.start, periodRange.end))
  }, [periodKind, periodRange])

  const compareEnd = useMemo(() => {
    if (!periodLengthDays) return null
    return shiftDateStr(paramCompareStart, periodLengthDays - 1)
  }, [paramCompareStart, periodLengthDays])

  // ── Загрузка живого счётчика записей ──────────────────────────────
  useEffect(() => {
    if (customInvalid) { setEntriesCount(0); return }
    let cancelled = false
    setEntriesCount(null)
    window.freshMind.countEntriesInRange({
      startISO: periodRange.start,
      endISO: periodRange.end
    }).then(n => { if (!cancelled) setEntriesCount(typeof n === 'number' ? n : 0) })
    return () => { cancelled = true }
  }, [periodRange.start, periodRange.end, customInvalid])

  // ── Загрузка списка сфер и даты первой записи ────────────────────
  useEffect(() => {
    window.freshMind.getSpheres().then(list => setSpheres(list || []))
    window.freshMind.getFirstEntryDate().then(d => setFirstEntryDate(d || null))
  }, [])

  // ── Resize observer + ESC ────────────────────────────────────────
  useEffect(() => {
    if (!panelRef.current) return
    const update = () => {
      if (panelRef.current) window.freshMind.resizeAiExport(panelRef.current.offsetHeight)
    }
    const ro = new ResizeObserver(update)
    ro.observe(panelRef.current)
    update()
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !busy) window.freshMind.closeAiExport() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy])

  // ── Toast helper ──────────────────────────────────────────────────
  function showStatus(text, kind = 'ok', ms = 4500) {
    setStatus({ text, kind })
    if (ms > 0) setTimeout(() => setStatus(null), ms)
  }

  // ── Сборка финального промпта ─────────────────────────────────────
  const selectedPrompt = promptId ? getPromptById(promptId) : null

  function assemblePrompt() {
    if (!selectedPrompt) return ''
    const params = {
      period:       periodHumanText(periodKind, periodRange.start, periodRange.end),
      periodStart:  periodRange.start,
      periodEnd:    periodRange.end,
      sphere:       paramSphere,
      question:     paramQuestion.trim(),
      compareStart: paramCompareStart,
      compareEnd:   compareEnd || '',
      customText:   paramCustomText.trim()
    }
    let text = selectedPrompt.template
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{${k}}`).join(v)
    }
    return text
  }

  // ── Валидация ─────────────────────────────────────────────────────
  const hasEntries = entriesCount != null && entriesCount > 0
  const canGenerate = !busy && !customInvalid && hasEntries

  const promptInputs = selectedPrompt?.inputs || []
  const needsSphere      = promptInputs.includes('sphere')
  const needsQuestion    = promptInputs.includes('question')
  const needsCompareDate = promptInputs.includes('compareDate')
  const needsCustomText  = promptInputs.includes('customText')

  const inputsOk =
    (!needsSphere      || (paramSphere && paramSphere.length > 0)) &&
    (!needsQuestion    || paramQuestion.trim().length > 0) &&
    (!needsCompareDate || (periodLengthDays && paramCompareStart && paramCompareStart < periodRange.start)) &&
    (!needsCustomText  || paramCustomText.trim().length > 0)

  const canCopy = !busy && !!selectedPrompt && inputsOk

  // ── Действия ──────────────────────────────────────────────────────
  async function doCopy() {
    try {
      const text = assemblePrompt()
      await navigator.clipboard.writeText(text)
      showStatus('Промпт скопирован в буфер. Открой свой ИИ-сервис, вставь промпт и приложи к нему файл отчёта.', 'ok', 6500)
    } catch (err) {
      showStatus(`Не удалось скопировать: ${err.message}`, 'err')
    }
  }

  async function doGenerate() {
    setBusy(true)
    try {
      // Собираем промпт если тип выбран И все обязательные поля заполнены.
      // Если нет — файл будет только с данными (как было раньше).
      const promptText = (selectedPrompt && inputsOk) ? assemblePrompt() : null

      const r = await window.freshMind.exportAiReport({
        startISO:   periodRange.start,
        endISO:     periodRange.end,
        promptText
      })
      if (r?.canceled) {
        // Юзер закрыл диалог — без шума
      } else if (r?.ok) {
        const where = r.promptIncluded ? 'с инструкцией для разбора' : 'только данные'
        const corrNote = r.correlationsShown ? '' : ' • корреляции пропущены — мало данных'
        showStatus(`Отчёт сохранён (${where}): ${r.entries} ${pluralRecords(r.entries)}, ~${r.sizeKB} КБ${corrNote}`, 'ok', 7000)
      } else if (r?.error) {
        showStatus(`Ошибка: ${r.error}`, 'err')
      }
    } catch (err) {
      showStatus(`Не удалось сгенерировать отчёт: ${err.message || err}`, 'err')
    } finally {
      setBusy(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="aix-panel" ref={panelRef}>
      <div className="aix-header">
        <span className="aix-title">Экспорт для ИИ-аналитики</span>
        <button className="aix-close" onClick={() => window.freshMind.closeAiExport()} title="Закрыть">×</button>
      </div>

      <div className="aix-intro">
        Структурированный отчёт по записям и оценкам — для разбора в любом ИИ-сервисе которым пользуешься.
      </div>

      {/* Зона A — Период */}
      <div className="aix-section">
        <div className="aix-section-label">Период</div>
        <div className="aix-chips">
          {PERIOD_CHIPS.map(c => (
            <button
              key={c.id}
              className={`aix-chip ${periodKind === c.id ? 'active' : ''}`}
              onClick={() => setPeriodKind(c.id)}
            >{c.label}</button>
          ))}
        </div>
        {periodKind === 'custom' && (
          <div className="aix-date-row">
            <input
              type="date"
              className="aix-date-input"
              value={customStart}
              max={customEnd}
              onChange={e => setCustomStart(e.target.value)}
            />
            <span className="aix-date-dash">—</span>
            <input
              type="date"
              className="aix-date-input"
              value={customEnd}
              min={customStart}
              max={today}
              onChange={e => setCustomEnd(e.target.value)}
            />
          </div>
        )}
        <div className={`aix-count ${customInvalid ? 'err' : ''}`}>
          {customInvalid
            ? 'Дата начала позже даты конца'
            : entriesCount === null
              ? '…считаем'
              : entriesCount === 0
                ? 'Нет записей в выбранном периоде'
                : `${entriesCount} ${pluralRecords(entriesCount)} в выбранном периоде`}
        </div>
      </div>

      {/* Зона B — Тип разбора */}
      <div className="aix-section">
        <div className="aix-section-label">Тип разбора</div>
        <div className="aix-cards">
          {PROMPTS.map(p => (
            <button
              key={p.id}
              className={`aix-card ${promptId === p.id ? 'active' : ''}`}
              onClick={() => setPromptId(p.id)}
              title={p.hint}
            >
              <span className="aix-card-emoji">{p.emoji}</span>
              <span className="aix-card-label">{p.label}</span>
              <span className="aix-card-hint">{p.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Зона C — Условные параметры */}
      {selectedPrompt && promptInputs.length > 0 && (
        <div className="aix-section">
          {needsSphere && (
            <>
              <div className="aix-section-label">Сфера для фокуса</div>
              <select
                className="aix-select"
                value={paramSphere}
                onChange={e => setParamSphere(e.target.value)}
              >
                <option value="">— выбери сферу —</option>
                {spheres.map(s => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </>
          )}

          {needsQuestion && (
            <>
              <div className="aix-section-label">Сформулируй вопрос</div>
              <textarea
                className="aix-textarea"
                rows={3}
                placeholder="Например: «Стоит ли переходить с фриланса в найм?»"
                value={paramQuestion}
                onChange={e => setParamQuestion(e.target.value)}
              />
            </>
          )}

          {needsCompareDate && (
            <>
              <div className="aix-section-label">Сравнить с периодом, начинающимся с</div>
              {periodKind === 'all' ? (
                <div className="aix-helper-err">
                  Для сравнения выбери конкретный период (не «всё время»)
                </div>
              ) : (
                <>
                  <input
                    type="date"
                    className="aix-date-input"
                    value={paramCompareStart}
                    max={shiftDateStr(periodRange.start, -1)}
                    onChange={e => setParamCompareStart(e.target.value)}
                  />
                  <div className="aix-helper">
                    Длина = {periodLengthDays} дн. Конец сравниваемого периода: <b>{compareEnd && formatHumanDate(compareEnd)}</b>
                  </div>
                </>
              )}
            </>
          )}

          {needsCustomText && (
            <>
              <div className="aix-section-label">Свой промпт</div>
              <textarea
                className="aix-textarea"
                rows={5}
                placeholder="Опиши задачу для разбора. Отчёт за выбранный период будет приложен автоматически."
                value={paramCustomText}
                onChange={e => setParamCustomText(e.target.value)}
              />
              <div className="aix-examples">
                <div className="aix-examples-label">Например:</div>
                <div>• Найди где я противоречу сам себе</div>
                <div>• Подсчитай самые частые темы за месяц</div>
                <div>• Перескажи мой дневник голосом друга</div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Зона D — Действия */}
      <div className="aix-actions">
        <button
          className="aix-btn aix-btn-primary"
          onClick={doGenerate}
          disabled={!canGenerate}
          title={
            busy ? 'Идёт генерация…'
            : customInvalid ? 'Дата начала позже даты конца'
            : !hasEntries ? 'Нет записей в выбранном периоде'
            : selectedPrompt && inputsOk ? 'Сохранить .txt: инструкция + данные'
            : 'Сохранить .txt: только данные (выбери тип разбора чтобы зашить инструкцию)'
          }
        >
          {busy ? (
            <svg className="aix-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="12" cy="12" r="9" opacity="0.25"/><path d="M21 12a9 9 0 0 0-9-9"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          )}
          {busy ? 'Генерирую…' : 'Сгенерировать отчёт'}
        </button>
        <button
          className="aix-btn"
          onClick={doCopy}
          disabled={!canCopy}
          title={
            busy ? 'Подожди завершения генерации'
            : !selectedPrompt ? 'Выбери тип разбора выше'
            : needsSphere && !paramSphere ? 'Выбери сферу для фокуса'
            : needsQuestion && !paramQuestion.trim() ? 'Сформулируй вопрос для разбора'
            : needsCompareDate && periodKind === 'all' ? 'Для сравнения выбери конкретный период (не «всё время»)'
            : needsCompareDate && (!paramCompareStart || paramCompareStart >= periodRange.start) ? 'Дата сравниваемого периода должна быть раньше основного'
            : needsCustomText && !paramCustomText.trim() ? 'Опиши свою задачу в поле выше'
            : 'Скопировать собранный промпт в буфер'
          }
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          Копировать промпт
        </button>
      </div>

      <div className="aix-bottom-hint">
        Открой свой ИИ-сервис, вставь промпт и приложи к нему файл отчёта.
      </div>

      {status && (
        <div className={`aix-status aix-status-${status.kind}`}>{status.text}</div>
      )}
    </div>
  )
}

function pluralRecords(n) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'запись'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'записи'
  return 'записей'
}
