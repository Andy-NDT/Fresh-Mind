import { app } from 'electron'
import { join } from 'path'
import Database from 'better-sqlite3'

let db = null

export function getDb() {
  if (db) return db
  const dbPath = join(app.getPath('userData'), 'freshmind.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

// ── Migrations ────────────────────────────────────────────
const MIGRATIONS = [
  {
    version: 1,
    name: 'initial schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE sphere_groups (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT    NOT NULL,
          color       TEXT    NOT NULL,
          sort_order  INTEGER NOT NULL DEFAULT 0,
          created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
        );

        CREATE TABLE spheres (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT    NOT NULL,
          color       TEXT    NOT NULL,
          group_id    INTEGER REFERENCES sphere_groups(id) ON DELETE SET NULL,
          sort_order  INTEGER NOT NULL DEFAULT 0,
          scale_min   INTEGER NOT NULL DEFAULT 1,
          scale_max   INTEGER NOT NULL DEFAULT 10,
          archived    INTEGER NOT NULL DEFAULT 0,
          created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
        );

        CREATE TABLE ratings (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          sphere_id   INTEGER NOT NULL REFERENCES spheres(id) ON DELETE CASCADE,
          date        TEXT    NOT NULL,
          value       INTEGER NOT NULL,
          created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
          UNIQUE (sphere_id, date)
        );
        CREATE INDEX idx_ratings_sphere_date ON ratings(sphere_id, date);
        CREATE INDEX idx_ratings_date ON ratings(date);

        CREATE TABLE entries (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          content_html  TEXT    NOT NULL DEFAULT '',
          content_text  TEXT    NOT NULL DEFAULT '',
          mood_emoji    TEXT,
          pinned        INTEGER NOT NULL DEFAULT 0,
          created_at    INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
          updated_at    INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
          deleted_at    INTEGER
        );
        CREATE INDEX idx_entries_created ON entries(created_at DESC);
        CREATE INDEX idx_entries_pinned_v1 ON entries(pinned, created_at);

        CREATE TABLE tags (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT    NOT NULL UNIQUE,
          created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
        );

        CREATE TABLE entry_tags (
          entry_id  INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
          tag_id    INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
          PRIMARY KEY (entry_id, tag_id)
        );

        CREATE TABLE entry_spheres (
          entry_id  INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
          sphere_id INTEGER NOT NULL REFERENCES spheres(id) ON DELETE CASCADE,
          PRIMARY KEY (entry_id, sphere_id)
        );

        CREATE TABLE attachments (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          entry_id    INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
          type        TEXT    NOT NULL,
          path        TEXT    NOT NULL,
          original    TEXT,
          created_at  INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
        );
      `)
    }
  },
  {
    version: 2,
    name: 'content_json + sphere meta + rating note + new colors + partial indexes',
    up: (db) => {
      // entries: content_json — primary source of truth для редактирования
      db.exec(`ALTER TABLE entries ADD COLUMN content_json TEXT NOT NULL DEFAULT ''`)
      db.exec(`UPDATE entries SET content_json = '' WHERE content_json IS NULL`)

      // spheres: description, icon (archived уже есть в v1)
      db.exec(`ALTER TABLE spheres ADD COLUMN description TEXT`)
      db.exec(`ALTER TABLE spheres ADD COLUMN icon TEXT`)

      // ratings: note — контекст оценки
      db.exec(`ALTER TABLE ratings ADD COLUMN note TEXT`)

      // partial indexes for entries
      db.exec(`
        DROP INDEX IF EXISTS idx_entries_pinned;
        DROP INDEX IF EXISTS idx_entries_pinned_v1;
        DROP INDEX IF EXISTS idx_entries_deleted;
        CREATE INDEX idx_entries_pinned ON entries(pinned) WHERE pinned = 1;
        CREATE INDEX idx_entries_deleted ON entries(deleted_at) WHERE deleted_at IS NULL;
      `)

      // Обновить цвета групп и сфер на финальные (только если значения сидовые)
      const groupUpdates = [
        ['Здоровье', '#E8A55A', '#FFE0B2'],
        ['Развитие', '#7CBE6D', '#DCEDC8'],
        ['Труд', '#5BA8C7', '#B2EBF2'],
        ['Общество', '#B498C7', '#E1BEE7']
      ]
      const updGroup = db.prepare('UPDATE sphere_groups SET color = ? WHERE name = ? AND color = ?')
      for (const [name, oldC, newC] of groupUpdates) {
        updGroup.run(newC, name, oldC)
      }

      const _sphereUpdatesV2 = [
        // Здоровье
        ['Тело', '#E89050', '#FF8A65'],
        ['Сон', '#D88B65', '#FFB74D'],
        ['Питание', '#F0B570', '#FFCC80'],
        ['Энергия', '#E8A045', '#FF7043'],
        ['Восстановление', '#DEA577', '#FFAB91'],
        // Развитие
        ['Творчество', '#7CBE6D', '#9CCC65'],
        ['Обучение', '#9BC270', '#7CB342'],
        ['Рефлексия', '#6FAB8D', '#558B2F'],
        ['Проявление', '#8FC95E', '#AED581'],
        ['Доведение', '#5FA678', '#689F38'],
        // Труд
        ['Монетизация', '#5BA8C7', '#26C6DA'],
        ['Клиенты', '#6BB6CF', '#4DD0E1'],
        ['Vibecoding', '#4F95B8', '#29B6F6'],
        ['Видеомонтаж', '#6BAFC2', '#0288D1'],
        ['Стратегия', '#4585A8', '#0277BD'],
        // Общество
        ['Семья', '#B498C7', '#BA68C8'],
        ['Друзья', '#C2A8D2', '#9575CD'],
        ['Партнёр', '#C8A0BE', '#F06292'],
        ['Признание', '#A88CB8', '#EC407A'],
        ['Помощь', '#B8A2C8', '#AB47BC']
      ]
      const updSphere = db.prepare('UPDATE spheres SET color = ? WHERE name = ? AND color = ?')
      for (const [name, oldC, newC] of _sphereUpdatesV2) {
        updSphere.run(newC, name, oldC)
      }
    }
  },
  {
    version: 3,
    name: 'scale 0-10 + ratings entry_id, updated_at',
    up: (db) => {
      // scale_min: 1 -> 0 для всех существующих сфер
      db.exec(`UPDATE spheres SET scale_min = 0 WHERE scale_min = 1`)

      // ratings: добавляем entry_id (опциональная привязка к записи) и updated_at
      db.exec(`ALTER TABLE ratings ADD COLUMN entry_id INTEGER REFERENCES entries(id) ON DELETE SET NULL`)
      db.exec(`ALTER TABLE ratings ADD COLUMN updated_at INTEGER`)
      db.exec(`UPDATE ratings SET updated_at = created_at WHERE updated_at IS NULL`)

      // Partial index для быстрого поиска ratings по записям
      db.exec(`CREATE INDEX IF NOT EXISTS idx_ratings_entry ON ratings(entry_id) WHERE entry_id IS NOT NULL`)
    }
  },
  {
    version: 4,
    name: 'preferred sphere order per group (replaces hardcoded RadarChart order)',
    up: (db) => {
      const PREFERRED = {
        'Здоровье': ['Энергия', 'Тело', 'Восстановление', 'Сон', 'Питание'],
        'Общество': ['Помощь', 'Семья', 'Друзья', 'Партнёр', 'Признание'],
        'Труд':     ['Стратегия', 'Видеомонтаж', 'Vibecoding', 'Монетизация', 'Клиенты'],
        'Развитие': ['Рефлексия', 'Доведение', 'Обучение', 'Творчество', 'Проявление']
      }
      const upd = db.prepare(`
        UPDATE spheres SET sort_order = ?
        WHERE name = ? AND group_id = (SELECT id FROM sphere_groups WHERE name = ?)
      `)
      for (const [groupName, order] of Object.entries(PREFERRED)) {
        for (let i = 0; i < order.length; i++) {
          upd.run(i, order[i], groupName)
        }
      }
    }
  }
]

// Спец-ошибка: БД создана более новой версией приложения.
// Поднимается из runMigrations; main-процесс ловит и показывает пользователю
// модальное окно с понятным сообщением вместо падения.
export class FutureSchemaError extends Error {
  constructor(currentVersion, supportedVersion) {
    super(`DB user_version ${currentVersion} > supported ${supportedVersion}`)
    this.name = 'FutureSchemaError'
    this.currentVersion = currentVersion
    this.supportedVersion = supportedVersion
  }
}

function runMigrations(db) {
  let currentVersion = db.pragma('user_version', { simple: true })

  // Backfill from legacy `schema_version` table (pre-PRAGMA era)
  if (currentVersion === 0) {
    const hasLegacyTable = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
    ).get()
    if (hasLegacyTable) {
      const row = db.prepare('SELECT version FROM schema_version LIMIT 1').get()
      if (row && row.version) {
        currentVersion = row.version
        db.pragma(`user_version = ${row.version}`)
      }
    }
  }

  // Detect fresh DB (no spheres table yet)
  const hasSpheres = !!db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='spheres'"
  ).get()
  const isFreshDb = !hasSpheres

  const target = MIGRATIONS[MIGRATIONS.length - 1].version

  // Защита от downgrade: если БД из будущей версии — прекращаем работу
  // ДО запуска любых миграций, чтобы не повредить данные.
  if (currentVersion > target) {
    throw new FutureSchemaError(currentVersion, target)
  }
  if (currentVersion >= target) return

  const tx = db.transaction(() => {
    for (const m of MIGRATIONS) {
      if (m.version <= currentVersion) continue
      m.up(db)
      db.pragma(`user_version = ${m.version}`)
    }
  })
  tx()

  if (isFreshDb) {
    seedDefaults(db)
  }
}

function seedDefaults(db) {
  const groups = [
    { name: 'Здоровье', color: '#FFE0B2', sort_order: 0 },
    { name: 'Развитие', color: '#DCEDC8', sort_order: 1 },
    { name: 'Труд', color: '#B2EBF2', sort_order: 2 },
    { name: 'Общество', color: '#E1BEE7', sort_order: 3 }
  ]

  // Порядок внутри каждой группы — предпочтительный (тёмное → светлое визуально).
  const spheres = [
    // Здоровье
    { group: 'Здоровье', name: 'Энергия',        color: '#FF7043' },
    { group: 'Здоровье', name: 'Тело',           color: '#FF8A65' },
    { group: 'Здоровье', name: 'Восстановление', color: '#FFAB91' },
    { group: 'Здоровье', name: 'Сон',            color: '#FFB74D' },
    { group: 'Здоровье', name: 'Питание',        color: '#FFCC80' },
    // Развитие
    { group: 'Развитие', name: 'Рефлексия',      color: '#558B2F' },
    { group: 'Развитие', name: 'Доведение',      color: '#689F38' },
    { group: 'Развитие', name: 'Обучение',       color: '#7CB342' },
    { group: 'Развитие', name: 'Творчество',     color: '#9CCC65' },
    { group: 'Развитие', name: 'Проявление',     color: '#AED581' },
    // Труд
    { group: 'Труд', name: 'Стратегия',          color: '#0277BD' },
    { group: 'Труд', name: 'Проекты',            color: '#0288D1' },
    { group: 'Труд', name: 'Навыки',             color: '#29B6F6' },
    { group: 'Труд', name: 'Монетизация',        color: '#26C6DA' },
    { group: 'Труд', name: 'Клиенты',            color: '#4DD0E1' },
    // Общество
    { group: 'Общество', name: 'Помощь',         color: '#AB47BC' },
    { group: 'Общество', name: 'Семья',          color: '#BA68C8' },
    { group: 'Общество', name: 'Друзья',         color: '#9575CD' },
    { group: 'Общество', name: 'Партнёр',        color: '#F06292' },
    { group: 'Общество', name: 'Признание',      color: '#EC407A' }
  ]

  const insertGroup = db.prepare('INSERT INTO sphere_groups (name, color, sort_order) VALUES (?, ?, ?)')
  const insertSphere = db.prepare('INSERT INTO spheres (name, color, group_id, sort_order) VALUES (?, ?, ?, ?)')

  const groupIds = {}
  const tx = db.transaction(() => {
    for (const g of groups) {
      const info = insertGroup.run(g.name, g.color, g.sort_order)
      groupIds[g.name] = info.lastInsertRowid
    }
    // sort_order — локальный внутри каждой группы (0..N-1)
    const perGroupCount = {}
    for (const s of spheres) {
      const idx = perGroupCount[s.group] ?? 0
      insertSphere.run(s.name, s.color, groupIds[s.group], idx)
      perGroupCount[s.group] = idx + 1
    }
  })
  tx()
}

// ── Sphere groups ─────────────────────────────────────────
export function listGroups() {
  return getDb().prepare('SELECT * FROM sphere_groups ORDER BY sort_order, id').all()
}

export function saveGroup(group) {
  const d = getDb()
  if (group.id) {
    d.prepare('UPDATE sphere_groups SET name = ?, color = ?, sort_order = ? WHERE id = ?')
      .run(group.name, group.color, group.sort_order ?? 0, group.id)
    return group
  }
  const info = d.prepare('INSERT INTO sphere_groups (name, color, sort_order) VALUES (?, ?, ?)')
    .run(group.name, group.color, group.sort_order ?? 0)
  return { ...group, id: info.lastInsertRowid }
}

export function deleteGroup(id) {
  getDb().prepare('DELETE FROM sphere_groups WHERE id = ?').run(id)
}

// ── Spheres ───────────────────────────────────────────────
export function listSpheres({ includeArchived = false } = {}) {
  const where = includeArchived ? '' : 'WHERE s.archived = 0'
  return getDb().prepare(`
    SELECT s.*, g.name as group_name, g.color as group_color
    FROM spheres s LEFT JOIN sphere_groups g ON g.id = s.group_id
    ${where}
    ORDER BY s.sort_order, s.id
  `).all()
}

export function saveSphere(sphere) {
  const d = getDb()
  if (sphere.id) {
    d.prepare(`
      UPDATE spheres SET
        name = ?, color = ?, group_id = ?,
        sort_order = ?, scale_min = ?, scale_max = ?, archived = ?,
        description = ?, icon = ?
      WHERE id = ?
    `).run(
      sphere.name, sphere.color, sphere.group_id ?? null,
      sphere.sort_order ?? 0, sphere.scale_min ?? 0, sphere.scale_max ?? 10,
      sphere.archived ? 1 : 0, sphere.description ?? null, sphere.icon ?? null,
      sphere.id
    )
    return sphere
  }
  const info = d.prepare(`
    INSERT INTO spheres (name, color, group_id, sort_order, scale_min, scale_max, description, icon)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sphere.name, sphere.color, sphere.group_id ?? null,
    sphere.sort_order ?? 0, sphere.scale_min ?? 0, sphere.scale_max ?? 10,
    sphere.description ?? null, sphere.icon ?? null
  )
  return { ...sphere, id: info.lastInsertRowid }
}

export function deleteSphere(id) {
  getDb().prepare('DELETE FROM spheres WHERE id = ?').run(id)
}

export function reorderSpheres(orderedIds) {
  const d = getDb()
  const upd = d.prepare('UPDATE spheres SET sort_order = ? WHERE id = ?')
  const tx = d.transaction((ids) => {
    ids.forEach((id, i) => upd.run(i, id))
  })
  tx(orderedIds)
}

// ── Ratings ───────────────────────────────────────────────
export function setRating(sphereId, date, value, note = null, entryId = null) {
  const now = Date.now()
  getDb().prepare(`
    INSERT INTO ratings (sphere_id, date, value, note, entry_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sphere_id, date) DO UPDATE SET
      value = excluded.value,
      note = excluded.note,
      entry_id = excluded.entry_id,
      updated_at = excluded.updated_at
  `).run(sphereId, date, value, note, entryId, now, now)
}

export function deleteRating(sphereId, date) {
  getDb().prepare('DELETE FROM ratings WHERE sphere_id = ? AND date = ?').run(sphereId, date)
}

export function getLastRatingBefore(sphereId, date) {
  return getDb().prepare(`
    SELECT * FROM ratings
    WHERE sphere_id = ? AND date < ?
    ORDER BY date DESC LIMIT 1
  `).get(sphereId, date)
}

export function getEntriesForSphere(sphereId, limit = 5) {
  const rows = getDb().prepare(`
    SELECT e.* FROM entries e
    JOIN entry_spheres es ON es.entry_id = e.id
    WHERE es.sphere_id = ? AND e.deleted_at IS NULL
    ORDER BY e.created_at DESC LIMIT ?
  `).all(sphereId, limit)
  return rows.map(hydrateEntry)
}

export function getRatingsForDate(date) {
  return getDb().prepare('SELECT * FROM ratings WHERE date = ?').all(date)
}

export function getLatestRatings(uptoDate = null) {
  const d = getDb()
  if (uptoDate) {
    return d.prepare(`
      SELECT r.* FROM ratings r
      INNER JOIN (
        SELECT sphere_id, MAX(date) as max_date
        FROM ratings WHERE date <= ?
        GROUP BY sphere_id
      ) m ON m.sphere_id = r.sphere_id AND m.max_date = r.date
    `).all(uptoDate)
  }
  return d.prepare(`
    SELECT r.* FROM ratings r
    INNER JOIN (
      SELECT sphere_id, MAX(date) as max_date FROM ratings GROUP BY sphere_id
    ) m ON m.sphere_id = r.sphere_id AND m.max_date = r.date
  `).all()
}

export function getSphereHistory(sphereId, daysBack = 365) {
  const since = new Date()
  since.setDate(since.getDate() - daysBack)
  const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`
  return getDb().prepare(`
    SELECT date, value, note FROM ratings
    WHERE sphere_id = ? AND date >= ?
    ORDER BY date
  `).all(sphereId, sinceStr)
}

// Список дат с количеством записей за период [startDate..endDate].
// Возвращает [{ date: 'YYYY-MM-DD', cnt }] — для оверлея на графике тренда.
export function getEntryDates(startDate, endDate) {
  return getDb().prepare(`
    SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') as date, COUNT(*) as cnt
    FROM entries
    WHERE deleted_at IS NULL
      AND strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') >= ?
      AND strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') <= ?
    GROUP BY date
    ORDER BY date
  `).all(startDate, endDate)
}

// ── Корзина / soft-удалённые ──────────────────────────
export function listTrash() {
  return getDb().prepare(`
    SELECT * FROM entries
    WHERE deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
  `).all().map(hydrateEntry)
}

// ── Полный экспорт данных (JSON-snapshot) ────────────
export function exportAllData() {
  const d = getDb()
  return {
    version: d.pragma('user_version', { simple: true }),
    exportedAt: Date.now(),
    appName: 'Fresh Mind',
    groups: d.prepare('SELECT * FROM sphere_groups').all(),
    spheres: d.prepare('SELECT * FROM spheres').all(),
    entries: d.prepare('SELECT * FROM entries').all(),
    tags: d.prepare('SELECT * FROM tags').all(),
    entry_tags: d.prepare('SELECT * FROM entry_tags').all(),
    entry_spheres: d.prepare('SELECT * FROM entry_spheres').all(),
    ratings: d.prepare('SELECT * FROM ratings').all(),
    attachments: d.prepare('SELECT * FROM attachments').all()
  }
}

// Импорт: заменяет ВСЁ содержимое БД на данные из snapshot'а.
// Делает резервную копию текущей БД перед очисткой (на тот же диск).
export function importAllData(snapshot, fsModule, dbPath) {
  const d = getDb()
  const tx = d.transaction(() => {
    d.exec(`
      DELETE FROM ratings;
      DELETE FROM entry_spheres;
      DELETE FROM entry_tags;
      DELETE FROM attachments;
      DELETE FROM entries;
      DELETE FROM tags;
      DELETE FROM spheres;
      DELETE FROM sphere_groups;
    `)
    const insGroup = d.prepare(`INSERT INTO sphere_groups (id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)`)
    for (const g of snapshot.groups || []) {
      insGroup.run(g.id, g.name, g.color, g.sort_order ?? 0, g.created_at ?? Date.now())
    }
    const insSphere = d.prepare(`INSERT INTO spheres (id, name, color, group_id, sort_order, scale_min, scale_max, archived, created_at, description, icon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const s of snapshot.spheres || []) {
      insSphere.run(s.id, s.name, s.color, s.group_id ?? null, s.sort_order ?? 0, s.scale_min ?? 0, s.scale_max ?? 10, s.archived ? 1 : 0, s.created_at ?? Date.now(), s.description ?? null, s.icon ?? null)
    }
    const insTag = d.prepare(`INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)`)
    for (const t of snapshot.tags || []) {
      insTag.run(t.id, t.name, t.created_at ?? Date.now())
    }
    const insEntry = d.prepare(`INSERT INTO entries (id, content_json, content_html, content_text, mood_emoji, pinned, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const e of snapshot.entries || []) {
      insEntry.run(e.id, e.content_json ?? '', e.content_html ?? '', e.content_text ?? '', e.mood_emoji ?? null, e.pinned ? 1 : 0, e.created_at ?? Date.now(), e.updated_at ?? Date.now(), e.deleted_at ?? null)
    }
    const insET = d.prepare(`INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?)`)
    for (const et of snapshot.entry_tags || []) {
      insET.run(et.entry_id, et.tag_id)
    }
    const insES = d.prepare(`INSERT INTO entry_spheres (entry_id, sphere_id) VALUES (?, ?)`)
    for (const es of snapshot.entry_spheres || []) {
      insES.run(es.entry_id, es.sphere_id)
    }
    const insR = d.prepare(`INSERT INTO ratings (id, sphere_id, date, value, created_at, note, entry_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    for (const r of snapshot.ratings || []) {
      insR.run(r.id, r.sphere_id, r.date, r.value, r.created_at ?? Date.now(), r.note ?? null, r.entry_id ?? null, r.updated_at ?? r.created_at ?? Date.now())
    }
    const insA = d.prepare(`INSERT INTO attachments (id, entry_id, type, path, original, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    for (const a of snapshot.attachments || []) {
      insA.run(a.id, a.entry_id, a.type, a.path, a.original ?? null, a.created_at ?? Date.now())
    }
  })
  tx()
  return { ok: true }
}

// Записи за тот же календарный MM-DD в прошлые годы (для «В этот день»).
// dateISO — текущая дата (полная). Возвращаем строго прошлогодние и ранее.
export function getOnThisDay(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number)
  const md = `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const startOfYearForMD = new Date(y, m - 1, d, 0, 0, 0, 0).getTime()
  const rows = getDb().prepare(`
    SELECT * FROM entries
    WHERE deleted_at IS NULL
      AND strftime('%m-%d', created_at / 1000, 'unixepoch', 'localtime') = ?
      AND created_at < ?
    ORDER BY created_at DESC
    LIMIT 5
  `).all(md, startOfYearForMD)
  return rows.map(hydrateEntry)
}

// Сводка за период [startISO..endISO] (детерминированные числа, без интерпретаций).
// Используется для «Сводка за месяц/год».
export function getSummaryStats({ startISO, endISO }) {
  const d = getDb()
  const startMs = new Date(startISO + 'T00:00:00').getTime()
  const endMs = new Date(endISO + 'T23:59:59.999').getTime()

  const totalEntries = d.prepare(`
    SELECT COUNT(*) as cnt FROM entries
    WHERE deleted_at IS NULL AND created_at >= ? AND created_at <= ?
  `).get(startMs, endMs).cnt

  const activeDays = d.prepare(`
    SELECT COUNT(DISTINCT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime')) as cnt
    FROM entries
    WHERE deleted_at IS NULL AND created_at >= ? AND created_at <= ?
  `).get(startMs, endMs).cnt

  const topTags = d.prepare(`
    SELECT t.name, COUNT(*) as cnt FROM tags t
    JOIN entry_tags et ON et.tag_id = t.id
    JOIN entries e ON e.id = et.entry_id
    WHERE e.deleted_at IS NULL AND e.created_at >= ? AND e.created_at <= ?
    GROUP BY t.id
    ORDER BY cnt DESC, t.name
    LIMIT 8
  `).all(startMs, endMs)

  const moods = d.prepare(`
    SELECT mood_emoji as emoji, COUNT(*) as cnt FROM entries
    WHERE deleted_at IS NULL AND created_at >= ? AND created_at <= ?
      AND mood_emoji IS NOT NULL AND mood_emoji <> ''
    GROUP BY mood_emoji
    ORDER BY cnt DESC
  `).all(startMs, endMs)

  const activeDay = d.prepare(`
    SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') as date, COUNT(*) as cnt
    FROM entries
    WHERE deleted_at IS NULL AND created_at >= ? AND created_at <= ?
    GROUP BY date
    ORDER BY cnt DESC, date DESC
    LIMIT 1
  `).get(startMs, endMs)

  const sphereAvgs = d.prepare(`
    SELECT s.id, s.name, s.color, AVG(r.value) as avg, COUNT(r.id) as cnt
    FROM ratings r
    JOIN spheres s ON s.id = r.sphere_id
    WHERE r.date >= ? AND r.date <= ?
    GROUP BY s.id
    ORDER BY s.sort_order, s.id
  `).all(startISO, endISO)

  return { totalEntries, activeDays, topTags, moods, activeDay, sphereAvgs }
}

// Записи, сгруппированные по дням (для оверлея с иконками на графике тренда).
// Возвращает [{ date, entries: [{ id, mood, pinned, text, ts, spheres:[colors], tags:[names] }] }]
export function getEntriesByDay(startDate, endDate) {
  const d = getDb()
  const rows = d.prepare(`
    SELECT id, content_text, mood_emoji, pinned, created_at,
           strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') as date
    FROM entries
    WHERE deleted_at IS NULL
      AND strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') >= ?
      AND strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') <= ?
    ORDER BY created_at
  `).all(startDate, endDate)

  const getSpheres = d.prepare(`
    SELECT s.color, s.name FROM spheres s
    JOIN entry_spheres es ON es.sphere_id = s.id
    WHERE es.entry_id = ?
  `)
  const getTags = d.prepare(`
    SELECT t.name FROM tags t
    JOIN entry_tags et ON et.tag_id = t.id
    WHERE et.entry_id = ?
  `)

  const byDate = new Map()
  for (const r of rows) {
    const spheres = getSpheres.all(r.id)
    const tags = getTags.all(r.id).map(x => x.name)
    if (!byDate.has(r.date)) byDate.set(r.date, [])
    byDate.get(r.date).push({
      id: r.id,
      mood: r.mood_emoji,
      pinned: !!r.pinned,
      text: r.content_text || '',
      ts: r.created_at,
      spheres,
      tags
    })
  }
  return [...byDate.entries()].map(([date, entries]) => ({ date, entries }))
}

// Средние оценки по дням за период [startDate..endDate]. Для общего тренда.
export function getDailyAverages(startDate, endDate) {
  return getDb().prepare(`
    SELECT date, AVG(value) as avg, COUNT(*) as cnt
    FROM ratings
    WHERE date >= ? AND date <= ?
    GROUP BY date
    ORDER BY date
  `).all(startDate, endDate)
}

// ── Entries ───────────────────────────────────────────────
function hydrateEntry(entry) {
  if (!entry) return null
  const d = getDb()
  const tags = d.prepare(`
    SELECT t.name FROM tags t
    JOIN entry_tags et ON et.tag_id = t.id
    WHERE et.entry_id = ? ORDER BY t.name
  `).all(entry.id).map(r => r.name)
  const spheres = d.prepare(`
    SELECT s.id, s.name, s.color FROM spheres s
    JOIN entry_spheres es ON es.sphere_id = s.id
    WHERE es.entry_id = ?
  `).all(entry.id)

  let content_json_parsed = null
  if (entry.content_json) {
    try { content_json_parsed = JSON.parse(entry.content_json) }
    catch { content_json_parsed = null }
  }

  return {
    ...entry,
    content_json: content_json_parsed,
    tags,
    spheres,
    pinned: !!entry.pinned
  }
}

export function listEntries({ limit = 100, offset = 0, includeDeleted = false } = {}) {
  const where = includeDeleted ? '' : 'WHERE deleted_at IS NULL'
  const rows = getDb().prepare(`
    SELECT * FROM entries ${where}
    ORDER BY pinned DESC, created_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset)
  return rows.map(hydrateEntry)
}

export function getEntry(id) {
  return hydrateEntry(getDb().prepare('SELECT * FROM entries WHERE id = ?').get(id))
}

export function saveEntry(entry) {
  const d = getDb()
  const now = Date.now()
  const contentJsonStr = entry.content_json
    ? (typeof entry.content_json === 'string' ? entry.content_json : JSON.stringify(entry.content_json))
    : ''

  const tx = d.transaction(() => {
    let id = entry.id
    if (id) {
      d.prepare(`
        UPDATE entries SET
          content_json = ?, content_html = ?, content_text = ?,
          mood_emoji = ?, pinned = ?, updated_at = ?
        WHERE id = ?
      `).run(
        contentJsonStr, entry.content_html ?? '', entry.content_text ?? '',
        entry.mood_emoji ?? null, entry.pinned ? 1 : 0, now, id
      )
    } else {
      const info = d.prepare(`
        INSERT INTO entries (content_json, content_html, content_text, mood_emoji, pinned, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        contentJsonStr, entry.content_html ?? '', entry.content_text ?? '',
        entry.mood_emoji ?? null, entry.pinned ? 1 : 0, now, now
      )
      id = info.lastInsertRowid
    }

    d.prepare('DELETE FROM entry_tags WHERE entry_id = ?').run(id)
    d.prepare('DELETE FROM entry_spheres WHERE entry_id = ?').run(id)

    const tagSet = new Set((entry.tags || []).map(t => t.trim().toLowerCase()).filter(Boolean))
    for (const tagName of tagSet) {
      let tag = d.prepare('SELECT id FROM tags WHERE name = ?').get(tagName)
      if (!tag) {
        const info = d.prepare('INSERT INTO tags (name) VALUES (?)').run(tagName)
        tag = { id: info.lastInsertRowid }
      }
      d.prepare('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)').run(id, tag.id)
    }

    // sphere_ratings: [{sphere_id, value}] — пишем в entry_spheres + ratings (UPSERT)
    // Дата rating'а = дата создания записи (YYYY-MM-DD из created_at)
    const createdRow = d.prepare('SELECT created_at FROM entries WHERE id = ?').get(id)
    const entryDate = new Date(createdRow.created_at).toISOString().slice(0, 10)
    const upsertRating = d.prepare(`
      INSERT INTO ratings (sphere_id, date, value, note, entry_id, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, ?, ?)
      ON CONFLICT(sphere_id, date) DO UPDATE SET
        value = excluded.value,
        entry_id = excluded.entry_id,
        updated_at = excluded.updated_at
    `)
    const insSphereLink = d.prepare('INSERT OR IGNORE INTO entry_spheres (entry_id, sphere_id) VALUES (?, ?)')

    for (const sr of (entry.sphere_ratings || [])) {
      if (sr.sphere_id == null) continue
      insSphereLink.run(id, sr.sphere_id)
      if (sr.value != null) {
        upsertRating.run(sr.sphere_id, entryDate, sr.value, id, now, now)
      }
    }

    return id
  })
  const id = tx()
  return getEntry(id)
}

export function softDeleteEntry(id) {
  getDb().prepare('UPDATE entries SET deleted_at = ? WHERE id = ?').run(Date.now(), id)
}

export function restoreEntry(id) {
  getDb().prepare('UPDATE entries SET deleted_at = NULL WHERE id = ?').run(id)
}

export function purgeEntry(id) {
  const d = getDb()
  const row = d.prepare('SELECT content_html FROM entries WHERE id = ?').get(id)
  d.prepare('DELETE FROM entries WHERE id = ?').run(id)
  return row && row.content_html ? row.content_html : ''
}

// ── Tags ──────────────────────────────────────────────────
export function listTags() {
  return getDb().prepare(`
    SELECT t.name, COUNT(et.entry_id) as count
    FROM tags t LEFT JOIN entry_tags et ON et.tag_id = t.id
    GROUP BY t.id ORDER BY count DESC, t.name
  `).all()
}

// ── Stats ─────────────────────────────────────────────────
export function getStats() {
  const d = getDb()
  const totalEntries = d.prepare('SELECT COUNT(*) as c FROM entries WHERE deleted_at IS NULL').get().c
  const pinnedEntries = d.prepare('SELECT COUNT(*) as c FROM entries WHERE deleted_at IS NULL AND pinned = 1').get().c
  const spheresCount = d.prepare('SELECT COUNT(*) as c FROM spheres WHERE archived = 0').get().c
  const tagsCount = d.prepare('SELECT COUNT(DISTINCT tag_id) as c FROM entry_tags').get().c
  return { totalEntries, pinnedEntries, spheresCount, tagsCount }
}

// Кол-во не-удалённых записей в диапазоне [startISO, endISO] (включительно по календарным дням).
// Если startISO пустой/null — считаем «с самого начала». Если endISO пустой — «до сегодня включительно».
export function countEntriesInRange({ startISO, endISO }) {
  const d = getDb()
  const startMs = startISO ? new Date(startISO + 'T00:00:00').getTime() : 0
  const effectiveEnd = endISO || new Date().toISOString().slice(0, 10)
  const endMs = new Date(effectiveEnd + 'T23:59:59.999').getTime()
  return d.prepare(`
    SELECT COUNT(*) as cnt FROM entries
    WHERE deleted_at IS NULL AND created_at >= ? AND created_at <= ?
  `).get(startMs, endMs).cnt
}

// ── Helpers для AI-отчёта (Step 15.4) ─────────────────────────────

// Статы по каждой сфере за период: avg, min, max, кол-во оценок,
// средние в первой/последней трети периода — для расчёта тренда.
// Возвращает [{ id, name, color, group_id, avg, min, max, ratingsCount, firstThirdAvg, lastThirdAvg }]
// firstThirdAvg/lastThirdAvg = null если в трети нет оценок.
export function getSpherePeriodStats(startISO, endISO) {
  const d = getDb()
  // Длина периода в днях для расчёта границ третей
  const startDate = new Date(startISO + 'T00:00:00')
  const endDate   = new Date(endISO   + 'T00:00:00')
  const totalDays = Math.max(1, Math.round((endDate - startDate) / 86400000) + 1)
  const thirdLen = totalDays / 3
  const firstEndDate = new Date(startDate.getTime() + Math.floor(thirdLen) * 86400000)
  const lastStartDate = new Date(endDate.getTime() - Math.floor(thirdLen) * 86400000 + 86400000)
  const firstEndISO = firstEndDate.toISOString().slice(0, 10)
  const lastStartISO = lastStartDate.toISOString().slice(0, 10)

  const rows = d.prepare(`
    SELECT
      s.id, s.name, s.color, s.group_id,
      AVG(r.value)     AS avg,
      MIN(r.value)     AS min,
      MAX(r.value)     AS max,
      COUNT(r.id)      AS ratingsCount
    FROM spheres s
    LEFT JOIN ratings r ON r.sphere_id = s.id AND r.date >= ? AND r.date <= ?
    WHERE s.archived = 0
    GROUP BY s.id
    ORDER BY s.sort_order, s.id
  `).all(startISO, endISO)

  const firstStmt = d.prepare(`
    SELECT AVG(value) AS a FROM ratings WHERE sphere_id = ? AND date >= ? AND date <= ?
  `)
  const lastStmt = d.prepare(`
    SELECT AVG(value) AS a FROM ratings WHERE sphere_id = ? AND date >= ? AND date <= ?
  `)

  for (const row of rows) {
    row.firstThirdAvg = firstStmt.get(row.id, startISO, firstEndISO).a
    row.lastThirdAvg  = lastStmt.get(row.id, lastStartISO, endISO).a
  }
  return rows
}

// Все оценки по всем сферам в диапазоне, плоским списком — для расчёта корреляций.
// Возвращает [{ sphere_id, name, color, group_id, date, value }]
export function getRatingsByDateAcrossSpheres(startISO, endISO) {
  return getDb().prepare(`
    SELECT r.sphere_id, s.name, s.color, s.group_id, r.date, r.value
    FROM ratings r
    JOIN spheres s ON s.id = r.sphere_id
    WHERE s.archived = 0 AND r.date >= ? AND r.date <= ?
    ORDER BY r.date, r.sphere_id
  `).all(startISO, endISO)
}

// Кол-во записей в 4 бакетах по часу создания (local time).
// Возвращает { night: N, morning: N, day: N, evening: N }
// night = 0-5, morning = 6-11, day = 12-17, evening = 18-23
export function getTimeBuckets(startISO, endISO) {
  const d = getDb()
  const startMs = new Date(startISO + 'T00:00:00').getTime()
  const endMs = new Date(endISO + 'T23:59:59.999').getTime()
  const rows = d.prepare(`
    SELECT CAST(strftime('%H', created_at / 1000, 'unixepoch', 'localtime') AS INTEGER) AS h, COUNT(*) AS cnt
    FROM entries
    WHERE deleted_at IS NULL AND created_at >= ? AND created_at <= ?
    GROUP BY h
  `).all(startMs, endMs)
  const buckets = { night: 0, morning: 0, day: 0, evening: 0 }
  for (const r of rows) {
    if (r.h < 6)       buckets.night   += r.cnt
    else if (r.h < 12) buckets.morning += r.cnt
    else if (r.h < 18) buckets.day     += r.cnt
    else               buckets.evening += r.cnt
  }
  return buckets
}

// Кол-во уникальных дат в периоде, в которых есть хотя бы одна оценка.
// Используется для гейтинга секции корреляций (≥60 дней — показываем, иначе пропуск).
export function getDaysWithRatingsCount(startISO, endISO) {
  return getDb().prepare(`
    SELECT COUNT(DISTINCT date) AS cnt FROM ratings
    WHERE date >= ? AND date <= ?
  `).get(startISO, endISO).cnt
}

// ISO-дата (YYYY-MM-DD) самой ранней не-удалённой записи. null если БД пустая.
// Используется для разрешения периода «Всё время» в реальный диапазон.
export function getFirstEntryDate() {
  const d = getDb()
  const row = d.prepare(`
    SELECT MIN(created_at) AS m FROM entries WHERE deleted_at IS NULL
  `).get()
  if (!row?.m) return null
  return new Date(row.m).toISOString().slice(0, 10)
}

// Все не-удалённые записи в диапазоне, hydrated, в хронологическом порядке (старые → новые).
export function listEntriesInRange(startISO, endISO) {
  const d = getDb()
  const startMs = new Date(startISO + 'T00:00:00').getTime()
  const endMs = new Date(endISO + 'T23:59:59.999').getTime()
  const rows = d.prepare(`
    SELECT * FROM entries
    WHERE deleted_at IS NULL AND created_at >= ? AND created_at <= ?
    ORDER BY created_at ASC
  `).all(startMs, endMs)
  return rows.map(hydrateEntry)
}
