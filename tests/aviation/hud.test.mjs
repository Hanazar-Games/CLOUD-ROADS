import test from 'node:test';
import assert from 'node:assert/strict';
import { setText, setHTML, setAttribute, setStyle, setHidden } from '../../src/aviation/hud.js';

function element() {
  let writes = 0;
  const node = { attributes: new Map(), styles: new Map(), get writes() { return writes; } };
  for (const [key, initial] of [['textContent', ''], ['innerHTML', ''], ['hidden', false]]) {
    let value = initial;
    Object.defineProperty(node, key, { get: () => value, set(next) { value = next; writes++; } });
  }
  node.getAttribute = key => node.attributes.get(key) ?? null;
  node.setAttribute = (key, value) => { writes++; node.attributes.set(key, value); };
  node.style = { getPropertyValue: key => node.styles.get(key) ?? '', setProperty(key, value) { writes++; node.styles.set(key, value); } };
  return node;
}

test('unchanged HUD values do not rewrite text, lists, attributes, bars or visibility', () => {
  const node = element();
  const update = () => {
    setText(node, 0); setHTML(node, '<small>/ 6</small>');
    setAttribute(node, 'aria-disabled', false); setStyle(node, 'width', '50%'); setHidden(node, true);
  };
  update();
  assert.equal(node.writes, 5);
  for (let i = 0; i < 1000; i++) update();
  assert.equal(node.writes, 5);
});

test('HUD updates still reflect new values and recover after another UI action edits a node', () => {
  const node = element();
  setText(node, 'paused'); setText(node, 'running');
  assert.equal(node.textContent, 'running');
  node.textContent = 'reset'; setText(node, 'running');
  assert.equal(node.textContent, 'running');
  setHTML(node, '<li>1 / 3</li>'); setHTML(node, '<li>2 / 3</li>');
  assert.equal(node.innerHTML, '<li>2 / 3</li>');
  setAttribute(node, 'data-warning', true); setAttribute(node, 'data-warning', false);
  assert.equal(node.getAttribute('data-warning'), 'false');
  setStyle(node, '--remaining', '50%'); setStyle(node, '--remaining', '0%');
  assert.equal(node.style.getPropertyValue('--remaining'), '0%');
  setHidden(node, true); setHidden(node, false);
  assert.equal(node.hidden, false);
});

test('changing a plain HUD label retains its existing text node', () => {
  const text = { nodeType: 3, data: '100', nextSibling: null };
  const node = { firstChild: text, get textContent() { return text.data; }, set textContent(value) { assert.fail(`replaced text node with ${value}`); } };
  setText(node, 101);
  assert.equal(text.data, '101');
  setText(text, '102');
  assert.equal(text.textContent, '102');
});
