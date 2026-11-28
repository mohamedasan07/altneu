import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

test('Hero: renders fixed slide layers without AnimatePresence node accumulation', () => {
  const jsx = read('src/components/Hero/Hero.jsx');

  assert.doesNotMatch(jsx, /AnimatePresence/);
  assert.match(jsx, /slides\.map\(\(slide,\s*index\)\s*=>/);
  assert.match(jsx, /data-slide-active=\{isActive \? 'true' : 'false'\}/);
  assert.match(jsx, /aria-hidden=\{!isActive\}/);
  assert.match(jsx, /visibility:\s*isShown \? 'visible' : 'hidden'/);
});

test('Hero: handles visibilitychange, pageshow (bfcache), and cleans up timers', () => {
  const jsx = read('src/components/Hero/Hero.jsx');

  assert.match(jsx, /document\.addEventListener\('visibilitychange'/);
  assert.match(jsx, /window\.addEventListener\('pageshow'/);
  assert.match(jsx, /document\.removeEventListener\('visibilitychange'/);
  assert.match(jsx, /window\.removeEventListener\('pageshow'/);
  assert.match(jsx, /if \(!isVisible\) return undefined;/);
  assert.match(jsx, /clearInterval\(intervalId\)/);
  assert.match(jsx, /clearTransitionTimer\(\)/);
});

test('Hero: handles image loading and error recovery gracefully', () => {
  const jsx = read('src/components/Hero/Hero.jsx');

  assert.match(jsx, /onLoad=\{\(\) => handleImageReady\(slide\.id\)\}/);
  assert.match(jsx, /onError=\{\(\) => handleImageReady\(slide\.id\)\}/);
  assert.match(jsx, /decoding="async"/);
});

test('Hero CSS: enforces stable container, absolute inset slides, and overflow clipping', () => {
  const css = read('src/components/Hero/Hero.module.css');

  assert.match(css, /\.hero\s*\{[^}]*position:\s*relative;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.carouselContainer\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.picture\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*display:\s*block;[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.image\s*\{[^}]*display:\s*block;[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*object-fit:\s*cover;/s);
});
