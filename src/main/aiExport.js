// Генератор структурированного текстового отчёта для ИИ-аналитики.
// Запускается в main-процессе, пишет в WriteStream секциями (без аккумулирования в памяти).
//
// Принципы:
// • Никаких упоминаний LLM-сервисов в выводе. Файл нейтральный.
// • Никаких интерпретаций — только факты и числа.
// • Корреляции: только при ≥60 днях с оценками в периоде (иначе шум).

import {
  listGroups,
  getSummaryStats,
  getSpherePeriodStats,
  getRatingsByDateAcrossSpheres,
  getTimeBuckets,
  getDaysWithRatingsCount,
  listEntriesInRange
} from './db.js'

// ── Формат-хелперы ─────────────────────────────────────────────────
const MONTHS_GEN = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
]

function formatHumanDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS_GEN[m - 1]} ${y}`
}

function formatDateTime(ms) {
  const dt = new Date(ms)
  const y = dt.getFullYear()
  const m = MONTHS_GEN[dt.getMonth()]
  const d = dt.getDate()
  const hh = String(dt.getHours()).padStart(2, '0')
  const mm = String(dt.getMinutes()).padStart(2, '0')
  return `${d} ${m} ${y}, ${hh}:${mm}`
}

function daysBetween(startISO, endISO) {
  const a = new Date(startISO + 'T00:00:00').getTime()
  const b = new Date(endISO + 'T00:00:00').getTime()
  return Math.round((b - a) / 86400000) + 1
}

function ruPlural(n, one, few, many) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}

function padRight(s, width) {
  return s.length >= width ? s : s + ' '.repeat(width - s.length)
}

function fmtNum(n, digits = 1) {
  if (n == null || Number.isNaN(n)) return '—'
  return Number(n).toFixed(digits)
}

function trendLabel(first, last) {
  if (first == null && last == null) return '—'
  if (first == null) return `только в последней трети: ${fmtNum(last, 1)}`
  if (last == null)  return `только в первой трети: ${fmtNum(first, 1)}`
  const delta = last - first
  if (Math.abs(delta) < 0.5) return 'стабильно'
  const sign = delta > 0 ? '+' : ''
  return `${fmtNum(first, 1)} → ${fmtNum(last, 1)} (${sign}${fmtNum(delta, 1)})`
}

// Pearson r для двух массивов одинаковой длины
function pearson(xs, ys) {
  const n = xs.length
  if (n < 3) return null
  let sx = 0, sy = 0
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i] }
  const mx = sx / n, my = sy / n
  let num = 0, dx2 = 0, dy2 = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    num += dx * dy
    dx2 += dx * dx
    dy2 += dy * dy
  }
  const den = Math.sqrt(dx2 * dy2)
  if (den === 0) return null
  return num / den
}

const SEP = '═══════════════════════════════════════════════════════════════════════\n'
const SEP_DASH = '───────────────────────────────────────────────────────────────────────\n'

// ── Главная функция ────────────────────────────────────────────────
// Пишет полный отчёт в writeStream и возвращает мета-статистику.
// promptText (опц.): если задан — пишется в шапку файла как «ИНСТРУКЦИЯ ДЛЯ РАЗБОРА».
export async function generateReport({ startISO, endISO, promptText }, writeStream) {
  const write = (s) => { writeStream.write(s) }
  const trimmedPrompt = (promptText || '').trim()
  const promptIncluded = trimmedPrompt.length > 0

  // ── 0. ИНСТРУКЦИЯ (если выбрана) ─────────────────────────────────
  if (promptIncluded) {
    write('ИНСТРУКЦИЯ ДЛЯ РАЗБОРА:\n')
    write(SEP_DASH)
    write(trimmedPrompt + '\n')
    write(SEP_DASH)
    write('\n')
  }

  // Общие данные (одним проходом по БД)
  const totalDays = daysBetween(startISO, endISO)
  const summary = getSummaryStats({ startISO, endISO })  // totals, topTags, moods, activeDay, sphereAvgs
  const groups = listGroups()
  const sphereStats = getSpherePeriodStats(startISO, endISO)
  const timeBuckets = getTimeBuckets(startISO, endISO)
  const daysWithRatings = getDaysWithRatingsCount(startISO, endISO)
  const entries = listEntriesInRange(startISO, endISO)

  const totalRatings = sphereStats.reduce((acc, s) => acc + (s.ratingsCount || 0), 0)

  // ── 1. ШАПКА ────────────────────────────────────────────────────
  write(SEP)
  write('ДНЕВНИК FRESH MIND\n')
  write(`Период: ${formatHumanDate(startISO)} — ${formatHumanDate(endISO)} (${totalDays} ${ruPlural(totalDays, 'день', 'дня', 'дней')})\n`)
  write(`Всего записей: ${summary.totalEntries}\n`)
  write(`Всего оценок сфер: ${totalRatings}\n`)
  write(`Дней с записями: ${summary.activeDays} из ${totalDays}\n`)
  write(`Дней с оценками сфер: ${daysWithRatings}\n`)
  write(SEP)
  write('\n')

  // ── 2. ДИНАМИКА СФЕР ────────────────────────────────────────────
  write('ДИНАМИКА СФЕР (среднее за период, тренд первой → последней трети)\n\n')

  // Сгруппировать sphereStats по group_id
  const statsByGroup = new Map()
  for (const s of sphereStats) {
    const gid = s.group_id ?? 0
    if (!statsByGroup.has(gid)) statsByGroup.set(gid, [])
    statsByGroup.get(gid).push(s)
  }

  // Вывести каждую группу в порядке listGroups()
  const groupOrder = [...groups, { id: 0, name: 'Без группы' }]
  for (const g of groupOrder) {
    const list = statsByGroup.get(g.id) || []
    if (!list.length) continue
    write(`${(g.name || '').toUpperCase()}\n`)
    // Ширина имени для выравнивания
    const maxName = Math.max(...list.map(s => s.name.length))
    for (const s of list) {
      const avgStr = s.avg != null ? fmtNum(s.avg, 1) : '—'
      const trend = trendLabel(s.firstThirdAvg, s.lastThirdAvg)
      const cnt = s.ratingsCount || 0
      const cntStr = cnt > 0 ? `${cnt} ${ruPlural(cnt, 'оценка', 'оценки', 'оценок')}` : 'нет оценок'
      write(`  • ${padRight(s.name + ':', maxName + 2)} ${padRight(avgStr, 4)}  тренд: ${trend}  [${cntStr}]\n`)
    }
    write('\n')
  }

  // ── 3. ТОП-10 ЯРКИХ ЗАПИСЕЙ ─────────────────────────────────────
  write(SEP)
  write('ТОП-10 САМЫХ ЯРКИХ ЗАПИСЕЙ ПЕРИОДА\n')
  write('(вес: pinned ×3 + наличие настроения + кол-во сфер ×0.5 + длина текста)\n\n')

  const scored = entries.map(e => {
    const textLen = (e.content_text || '').length
    const score =
      (e.pinned ? 3 : 0) +
      (e.mood_emoji ? 1 : 0) +
      (e.spheres?.length || 0) * 0.5 +
      textLen / 500
    return { entry: e, score, textLen }
  }).sort((a, b) => b.score - a.score).slice(0, 10)

  if (!scored.length) {
    write('  (нет записей в периоде)\n\n')
  } else {
    for (const { entry: e } of scored) {
      const pinned = e.pinned ? '[закреплено]' : ''
      const mood = e.mood_emoji || ''
      write(`${formatDateTime(e.created_at)} ${pinned} ${mood}`.trimEnd() + '\n')
      if (e.spheres?.length) write(`Сферы: ${e.spheres.map(s => s.name).join(', ')}\n`)
      if (e.tags?.length)    write(`Теги: ${e.tags.map(t => '#' + t).join(', ')}\n`)
      const text = (e.content_text || '').trim()
      if (text) write(`«${text}»\n`)
      write('\n')
    }
  }

  // ── 4. ПАТТЕРНЫ ─────────────────────────────────────────────────
  write(SEP)
  write('ПАТТЕРНЫ\n\n')

  // Время записей
  const tbTotal = timeBuckets.night + timeBuckets.morning + timeBuckets.day + timeBuckets.evening
  write('Время записей:\n')
  if (tbTotal === 0) {
    write('  (нет записей)\n')
  } else {
    const pct = (n) => Math.round((n / tbTotal) * 100)
    write(`  • Утро (06:00–11:59):    ${timeBuckets.morning} (${pct(timeBuckets.morning)}%)\n`)
    write(`  • День (12:00–17:59):    ${timeBuckets.day} (${pct(timeBuckets.day)}%)\n`)
    write(`  • Вечер (18:00–23:59):   ${timeBuckets.evening} (${pct(timeBuckets.evening)}%)\n`)
    write(`  • Ночь (00:00–05:59):    ${timeBuckets.night} (${pct(timeBuckets.night)}%)\n`)
  }
  write('\n')

  // Топ-теги
  write('Самые частые теги:\n')
  if (!summary.topTags?.length) {
    write('  (нет тегов в периоде)\n')
  } else {
    for (const t of summary.topTags) {
      write(`  • #${t.name} — ${t.cnt}\n`)
    }
  }
  write('\n')

  // Распределение настроений
  if (!summary.moods?.length) {
    write('Распределение настроений:\n')
    write('  (настроения не отмечены ни в одной записи)\n')
  } else {
    const moodTotal = summary.moods.reduce((acc, m) => acc + m.cnt, 0)
    write(`Распределение настроений (${moodTotal} из ${summary.totalEntries} ${ruPlural(summary.totalEntries, 'записи', 'записей', 'записей')} с настроением):\n`)
    for (const m of summary.moods) {
      const pct = Math.round((m.cnt / moodTotal) * 100)
      write(`  • ${m.emoji} — ${m.cnt} (${pct}%)\n`)
    }
  }
  write('\n')

  // Самый активный день
  if (summary.activeDay) {
    write(`Самый активный день периода: ${formatHumanDate(summary.activeDay.date)} — ${summary.activeDay.cnt} ${ruPlural(summary.activeDay.cnt, 'запись', 'записи', 'записей')}\n\n`)
  }

  // ── 5. КОРРЕЛЯЦИИ ───────────────────────────────────────────────
  write(SEP)
  write('КОРРЕЛЯЦИИ МЕЖДУ СФЕРАМИ\n\n')

  if (daysWithRatings < 60) {
    write(`Раздел пропущен: для надёжной оценки корреляций нужно минимум 60 дней с оценками сфер, в выбранном периоде только ${daysWithRatings}.\n`)
    write('Корреляции на малой выборке создают ложные сигналы, поэтому раздел не показывается.\n\n')
  } else {
    const allRatings = getRatingsByDateAcrossSpheres(startISO, endISO)
    // Сгруппировать по sphere_id: Map<sphere_id, { name, dates: Map<date, value> }>
    const bySphere = new Map()
    for (const r of allRatings) {
      if (!bySphere.has(r.sphere_id)) bySphere.set(r.sphere_id, { name: r.name, dates: new Map() })
      bySphere.get(r.sphere_id).dates.set(r.date, r.value)
    }
    const sphereIds = [...bySphere.keys()]
    const correlations = []
    for (let i = 0; i < sphereIds.length; i++) {
      for (let j = i + 1; j < sphereIds.length; j++) {
        const a = bySphere.get(sphereIds[i])
        const b = bySphere.get(sphereIds[j])
        const xs = []
        const ys = []
        for (const [date, va] of a.dates) {
          const vb = b.dates.get(date)
          if (vb != null) { xs.push(va); ys.push(vb) }
        }
        if (xs.length < 30) continue
        const r = pearson(xs, ys)
        if (r == null) continue
        if (Math.abs(r) < 0.5) continue
        correlations.push({ a: a.name, b: b.name, r, n: xs.length })
      }
    }
    correlations.sort((p, q) => Math.abs(q.r) - Math.abs(p.r))

    if (!correlations.length) {
      write('Сильных корреляций (|r| ≥ 0.5 при ≥30 общих дней) не обнаружено.\n\n')
    } else {
      write(`Найдено ${correlations.length} ${ruPlural(correlations.length, 'пара', 'пары', 'пар')} с заметной связью:\n\n`)
      for (const c of correlations) {
        const arrow = c.r > 0 ? '↑↑ / ↓↓' : '↑↓ / ↓↑'
        const sign = c.r > 0 ? 'положительная' : 'обратная'
        write(`  • ${c.a}  ${arrow}  ${c.b}   r = ${fmtNum(c.r, 2)} (${sign}, ${c.n} общих дней)\n`)
      }
      write('\nЧтение: r = 1 — полное совпадение направления, r = -1 — полная противоположность,\n')
      write('r около 0 — связи не видно. |r| ≥ 0.5 здесь — порог «заметной» связи.\n\n')
    }
  }

  // ── 6. ПОЛНЫЕ ЗАПИСИ ────────────────────────────────────────────
  write(SEP)
  write('ПОЛНЫЕ ЗАПИСИ В ХРОНОЛОГИЧЕСКОМ ПОРЯДКЕ\n')
  write(SEP)
  write('\n')

  if (!entries.length) {
    write('(нет записей в периоде)\n')
  } else {
    for (const e of entries) {
      const pinned = e.pinned ? '[закреплено]' : ''
      const mood = e.mood_emoji || ''
      write(`${formatDateTime(e.created_at)} ${pinned} ${mood}`.trimEnd() + '\n')
      if (e.spheres?.length) write(`Сферы: ${e.spheres.map(s => s.name).join(', ')}\n`)
      if (e.tags?.length)    write(`Теги: ${e.tags.map(t => '#' + t).join(', ')}\n`)
      const text = (e.content_text || '').trim()
      if (text) {
        write(text + '\n')
      }
      write('\n')
    }
  }

  return {
    entriesCount: summary.totalEntries,
    ratingsCount: totalRatings,
    activeDays: summary.activeDays,
    daysWithRatings,
    correlationsShown: daysWithRatings >= 60,
    promptIncluded
  }
}
