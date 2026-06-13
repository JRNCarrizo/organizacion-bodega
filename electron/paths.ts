import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export function getUserDataDir(): string {
  const dir = app.getPath('userData')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function getMealsDir(): string {
  const dir = path.join(getUserDataDir(), 'meals')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}
