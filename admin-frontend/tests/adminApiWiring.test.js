import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => fs.readFileSync(path.join(here, '..', rel), 'utf8')

test('auth.service.js validates non-empty JSON auth responses instead of returning undefined', () => {
  const src = read('src/services/auth.service.js')
  assert.match(src, /!data \|\| typeof data !== 'object' \|\| !data\.token \|\| !data\.admin/)
  assert.match(src, /Invalid authentication response from server/)
  assert.match(src, /Invalid session response from server/)
})

test('dashboard.service.js rejects non-object or HTML fallback payloads instead of defaulting to zero', () => {
  const src = read('src/services/dashboard.service.js')
  assert.match(src, /function assertPlainObject\(data/)
  assert.match(src, /Invalid dashboard stats response from server/)
})
