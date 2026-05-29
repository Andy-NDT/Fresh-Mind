import React, { useEffect, useRef, useState } from 'react'

/*
 * ─────────────────────────────────────────────────────────────────────────
 * TODO Шаг 15 — Экспорт для ИИ-аналитики (планируется v0.2.0, через 1-2 недели)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Третья кнопка в секции "Данные" этого окна: [Экспорт для ИИ-разбора]
 *
 * Создаёт читаемый текстовый отчёт (.txt), оптимизированный для контекста LLM:
 *   • Динамика 20 сфер за выбранный период (среднее, min/max, тренд)
 *   • Топ-10 ярких записей (по pinned / эмоции / частоте сфер)
 *   • Паттерны: время записей, частые теги, частое настроение, корреляции сфер
 *   • Полный текст записей за период
 *
 * Откроется попап с:
 *   • Выбор периода (месяц / квартал / полгода / год / всё)
 *   • Кнопка [Сгенерировать отчёт] → сохраняет .txt через showSaveDialog
 *   • Готовые шаблоны промптов (5 вариантов): глубокий разбор / одна сфера /
 *     слепые пятна / сравнение периодов / свой
 *   • Кнопка [Копировать промпт] — юзер сам решает куда вставлять (любой LLM-сервис,
 *     которым он пользуется). НЕ упоминаем конкретные сервисы в UI.
 *
 * Бэкенд: новый ipcMain.handle('export-ai-report', ({ period }) → {
 *   собирает данные через уже существующие функции
 *   (listEntries, getDailyAverages, getSphereHistory, getSummaryStats),
 *   форматирует в Markdown-подобный .txt с разделами и таблицами
 * })
 *
 * Эта фича — отдельный шаг 15, НЕ блокирует релиз 0.1.0.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default function App() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!panelRef.current) return
    const update = () => {
      if (panelRef.current) window.freshMind.resizeBackup(panelRef.current.offsetHeight)
    }
    const ro = new ResizeObserver(update)
    ro.observe(panelRef.current)
    update()
    return () => ro.disconnect()
  }, [status])

  // Esc → закрыть окно (только если не идёт работа с диалогом)
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !busy) window.freshMind.closeBackup() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy])

  function showStatus(text, kind = 'ok') {
    setStatus({ text, kind })
    setTimeout(() => setStatus(null), 4500)
  }

  async function doExport() {
    setBusy(true)
    const r = await window.freshMind.exportData()
    setBusy(false)
    if (r?.ok) showStatus(`Экспортировано ${r.entries} записей`, 'ok')
    else if (r?.error) showStatus(`Ошибка: ${r.error}`, 'err')
  }

  async function doImport() {
    if (!confirm('Импорт ЗАМЕНИТ все текущие данные. Текущая БД будет автоматически сохранена в .bak-файл рядом. Продолжить?')) return
    setBusy(true)
    const r = await window.freshMind.importData()
    setBusy(false)
    if (r?.ok) showStatus(`Импортировано ${r.entries} записей. Перезапусти Mind.`, 'ok')
    else if (r?.error) showStatus(`Ошибка импорта: ${r.error}`, 'err')
  }

  async function doBackup() {
    setBusy(true)
    const r = await window.freshMind.backupDataFolder()
    setBusy(false)
    if (r?.ok) showStatus(`Бэкап сохранён`, 'ok')
    else if (r?.error) showStatus(`Ошибка: ${r.error}`, 'err')
  }

  return (
    <div className="bk-panel" ref={panelRef}>
      <div className="bk-header">
        <span className="bk-title">Бэкап и данные</span>
        <button className="bk-close" onClick={() => window.freshMind.closeBackup()} title="Закрыть">×</button>
      </div>

      <div className="bk-section">
        <div className="bk-section-label">Экспорт / импорт</div>
        <div className="bk-section-hint">JSON-файл с записями, тегами, сферами и оценками. Вложения <b>не включаются</b> — для них используй полный бэкап ниже.</div>
        <div className="bk-buttons">
          <button className="bk-btn" onClick={doExport} disabled={busy} title="Сохранить все записи и оценки в .json файл">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Экспорт JSON
          </button>
          <button className="bk-btn" onClick={doImport} disabled={busy} title="Загрузить данные из .json — перезапишет всё">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            Импорт JSON
          </button>
        </div>
      </div>

      <div className="bk-section">
        <div className="bk-section-label">Полный бэкап папки данных</div>
        <div className="bk-section-hint">Копирует <b>всё</b>: базу данных + вложения. Удобно класть в Dropbox / OneDrive / Google Drive — синхронизация подхватит. Восстановление: вернуть папку обратно в <span className="bk-mono">%APPDATA%/fresh-mind/</span>.</div>
        <div className="bk-buttons">
          <button className="bk-btn bk-btn-wide bk-btn-primary" onClick={doBackup} disabled={busy} title="Скопировать всю папку данных (БД + вложения)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/></svg>
            Создать полный бэкап
          </button>
        </div>
      </div>

      {status && (
        <div className={`bk-status bk-status-${status.kind}`}>{status.text}</div>
      )}
    </div>
  )
}
