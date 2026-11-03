// FS-TSI-01 / FS-TSI-02. Run: node --test tests/tsi-a11y.node-test.mjs  (fake DOM, no deps)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const main = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function el() {
  const cls = new Set(); const attrs = {}; const handlers = {};
  return {
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c),
      toggle: (c, f) => { const on = f === undefined ? !cls.has(c) : f; on ? cls.add(c) : cls.delete(c); return on; } },
    setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: (k) => (k in attrs ? attrs[k] : null),
    addEventListener: (t, f) => { (handlers[t] ||= []).push(f); }, fire: (t, ev = {}) => (handlers[t] || []).forEach(f => f(ev)),
    focus() { this.focused = true; }, attrs, cls, style: {}, dataset: {},
  };
}

function run({ withIO = true } = {}) {
  const menuBtn = el(), mobileMenu = el(), reveal = el(), docEl = el(), body = el(), docHandlers = {};
  mobileMenu.setAttribute('data-open', 'false');
  const byId = { menuBtn, mobileMenu };
  const document = {
    documentElement: docEl, body,
    getElementById: (id) => byId[id] || null,
    querySelectorAll: (sel) => (sel === '.reveal' ? [reveal] : []),
    addEventListener: (t, f) => { (docHandlers[t] ||= []).push(f); },
    createElementNS: () => el(),
  };
  const window = { location: { search: '' }, addEventListener() {}, matchMedia: () => ({ matches: false }), scrollY: 0 };
  if (withIO) window.IntersectionObserver = class { observe() {} };
  const ctx = { document, window, URLSearchParams, Math, Array, localStorage: { getItem: () => null, setItem() {} },
    requestAnimationFrame() {}, setTimeout, console };
  if (withIO) ctx.IntersectionObserver = window.IntersectionObserver;
  ctx.window.document = document;
  vm.runInNewContext(main, ctx);
  return { menuBtn, mobileMenu, docEl, body, key: (k) => (docHandlers.keydown || []).forEach(f => f({ key: k })) };
}

test('TSI-01: .reveal is only hidden under .js-reveal (visible without script)', () => {
  assert.doesNotMatch(css, /(^|\n)\s*\.reveal\s*\{[^}]*opacity:\s*0/, 'bare .reveal must not set opacity: 0');
  assert.match(css, /\.js-reveal \.reveal\s*\{[^}]*opacity:\s*0/);
  assert.match(css, /\.js-reveal \.reveal\.visible\s*\{[^}]*opacity:\s*1/);
});

test('TSI-01: script enables hiding only when IntersectionObserver exists', () => {
  assert.equal(run({ withIO: true }).docEl.cls.has('js-reveal'), true);
  assert.equal(run({ withIO: false }).docEl.cls.has('js-reveal'), false);
});

test('TSI-02: menu button announces expanded state and controlled region', () => {
  const t = run();
  assert.equal(t.menuBtn.getAttribute('aria-controls'), 'mobileMenu');
  assert.equal(t.menuBtn.getAttribute('aria-expanded'), 'false');
  t.menuBtn.fire('click');
  assert.equal(t.menuBtn.getAttribute('aria-expanded'), 'true');
  assert.equal(t.mobileMenu.getAttribute('data-open'), 'true');
  assert.equal(t.menuBtn.getAttribute('aria-label'), 'Close menu');
  t.menuBtn.fire('click');
  assert.equal(t.menuBtn.getAttribute('aria-expanded'), 'false');
  assert.equal(t.menuBtn.getAttribute('aria-label'), 'Open menu');
});

test('TSI-02: Escape closes the menu and returns focus to the button', () => {
  const t = run();
  t.menuBtn.fire('click');
  t.key('Escape');
  assert.equal(t.mobileMenu.getAttribute('data-open'), 'false');
  assert.equal(t.menuBtn.getAttribute('aria-expanded'), 'false');
  assert.equal(t.menuBtn.focused, true);
});
