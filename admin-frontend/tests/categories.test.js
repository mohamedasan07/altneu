import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeCategoriesResponse } from '../src/utils/categoryNormalize.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = (rel) => fs.readFileSync(path.join(here, '..', rel), 'utf8')

test('normalizeCategoriesResponse: preserves category names, IDs, and metadata when returned as an array', () => {
  const input = [
    { id: 1, name: 'tshirts', slug: 'tshirts', isActive: true, sortOrder: 1, productCount: 5 },
    { id: 2, name: 'hoodies', slug: 'hoodies', isActive: false, sortOrder: 2, productCount: 0 },
  ]
  const result = normalizeCategoriesResponse(input)
  assert.equal(result.length, 2)
  assert.deepEqual(result[0], input[0])
  assert.deepEqual(result[1], input[1])
})

test('normalizeCategoriesResponse: handles empty category array', () => {
  assert.deepEqual(normalizeCategoriesResponse([]), [])
})

test('normalizeCategoriesResponse: handles null, undefined, and missing data safely', () => {
  assert.deepEqual(normalizeCategoriesResponse(null), [])
  assert.deepEqual(normalizeCategoriesResponse(undefined), [])
  assert.deepEqual(normalizeCategoriesResponse({}), [])
})

test('normalizeCategoriesResponse: handles unexpected string/HTML fallback responses safely', () => {
  assert.deepEqual(normalizeCategoriesResponse('<!doctype html><html></html>'), [])
  assert.deepEqual(normalizeCategoriesResponse('invalid'), [])
  assert.deepEqual(normalizeCategoriesResponse(42), [])
})

test('normalizeCategoriesResponse: unwraps { categories } or { data } envelope objects', () => {
  const wrapped1 = { categories: [{ id: 10, name: 'jerseys' }] }
  const wrapped2 = { data: [{ id: 11, name: 'baggy' }] }
  assert.deepEqual(normalizeCategoriesResponse(wrapped1), [{ id: 10, name: 'jerseys' }])
  assert.deepEqual(normalizeCategoriesResponse(wrapped2), [{ id: 11, name: 'baggy' }])
})

test('normalizeCategoriesResponse: filters out malformed items without names', () => {
  const mixed = [null, 'bad', { id: 1, name: '' }, { id: 2, name: 'shirts' }]
  assert.deepEqual(normalizeCategoriesResponse(mixed), [{ id: 2, name: 'shirts' }])
})

test('Admin ProductsPage & category.service wiring: guards against non-array categories', () => {
  const serviceSrc = read('src/services/category.service.js')
  assert.match(serviceSrc, /normalizeCategoriesResponse/)

  const productsPageSrc = read('src/pages/Products/ProductsPage.jsx')
  assert.match(productsPageSrc, /applyCategories/)
  assert.match(productsPageSrc, /Array\.isArray\(categories\)/)

  const filtersSrc = read('src/components/products/ProductFilters.jsx')
  assert.match(filtersSrc, /categories\.map/)

  const modalSrc = read('src/components/products/ProductModal.jsx')
  assert.match(modalSrc, /categories\.map/)
})
