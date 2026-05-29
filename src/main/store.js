import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

const userDataPath = app.getPath('userData')

export function loadJSON(filename) {
  const filePath = join(userDataPath, filename)
  if (!existsSync(filePath)) return null
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

export function saveJSON(filename, data) {
  const filePath = join(userDataPath, filename)
  try {
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch {
    /* silent — next save will retry */
  }
}