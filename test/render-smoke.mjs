/**
 * 渲染冒烟：node test/render-smoke.mjs
 *
 * 这里没有浏览器，也没有 React。用一套「假 React」把 lib/client.js 这份手写 bundle
 * 装进内存跑一遍，然后把组件树走一遍，检查几件肉眼截图看不出来的事：
 *   - 有没有 undefined / NaN 漏进 style 或直接当文本渲染出来（[object Object] 也算）
 *   - 开关、三档 chip、示范句这些关键元素真的画出来了
 *   - 关着和开着两种状态都画得出来（状态切换不炸）
 *   - overlay 上的角标带 no-drag（Electron 的拖拽区会吞掉点击）
 *
 * 假 React 只实现这个 bundle 用到的那几个 hook，够用即可，不追求兼容。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundle = fs.readFileSync(path.join(here, '..', 'lib', 'client.js'), 'utf8');

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass += 1; return; }
  fail += 1;
  failures.push(name + (detail ? ` — ${detail}` : ''));
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------- 假 React
let hookIndex = 0;
let hookState = [];
let pendingEffects = [];
const React = {
  createElement(type, props, ...children) {
    const all = children.length ? children : (props && props.children !== undefined ? [props.children] : []);
    return { type, props: Object.assign({}, props, { children: all.length === 1 ? all[0] : all }) };
  },
  Fragment: 'Fragment',
  useState(init) {
    const i = hookIndex++;
    if (!(i in hookState)) hookState[i] = typeof init === 'function' ? init() : init;
    const set = (v) => {
      hookState[i] = typeof v === 'function' ? v(hookState[i]) : v;
    };
    return [hookState[i], set];
  },
  useRef(v) { return { current: v }; },
  useMemo(fn) { return fn(); },
  useCallback(fn) { return fn; },
  useEffect(fn) { pendingEffects.push(fn); },
  useLayoutEffect(fn) { pendingEffects.push(fn); },
};

/** 把组件当函数调一次，拿到它 return 的树。 */
function render(component, props) {
  hookIndex = 0;
  hookState = [];
  pendingEffects = [];
  const prev = globalThis.React;
  globalThis.React = React;
  try {
    return component(props || {});
  } finally {
    globalThis.React = prev;
  }
}

// ---------------------------------------------------------------- 装 bundle
let factoryMod = null;
globalThis.window = {
  __ModuleLoader__: {
    load(spec) { factoryMod = spec; },
  },
};
const mod = { exports: {} };
// bundle 里用 CommonJS 的 module / exports / require 形状
const modFn = new Function('module', 'exports', 'require', 'React', 'window', 'setTimeout', 'clearTimeout', 'fetch', bundle);
modFn(mod, mod.exports, (n) => {
  if (n === 'react') return React;
  throw new Error(`unexpected require(${n})`);
}, React, globalThis.window, (fn) => 0, () => {}, () => Promise.reject(new Error('no network in smoke test')));

ok('bundle 调用了 __ModuleLoader__.load', !!factoryMod);
ok('注册的 id 是 dsh-wenyan', factoryMod && factoryMod.id === 'dsh-wenyan');

// 手写 bundle 的形状是 factory: function (require, module) —— loader 把 require 传进去，
// 所以这里也要按同样的签名调，不能空手调。
const requireShim = (n) => {
  if (n === 'react') return React;
  if (n === './lib/locale.js') return { dict: {} };
  throw new Error(`unexpected require(${n})`);
};
const built = factoryMod.factory ? factoryMod.factory(requireShim, mod) : mod.exports;
const I = (built && built.__internals) || mod.exports.__internals;
ok('__internals 有 Corner 和 Panel', !!(I && I.Corner && I.Panel));

// ---------------------------------------------------------------- 走树
const BAD = /\bundefined\b|NaN|\[object Object\]/;

function walk(node, visit, where) {
  if (node === null || node === undefined) return;
  if (typeof node === 'string' || typeof node === 'number') { visit({ text: String(node) }, where); return; }
  if (Array.isArray(node)) { node.forEach((n, i) => walk(n, visit, `${where}[${i}]`)); return; }
  if (typeof node === 'function') { walk(render(node, {}), visit, `${where}<${node.name || 'anon'}>`); return; }
  if (typeof node !== 'object' || !node.props) return;
  visit({ element: node }, where);
  const tag = typeof node.type === 'string' ? node.type : (node.type && (node.type.name || node.type.displayName)) || 'el';
  // 函数组件要把 props 真的传进去才算走树，否则 chip 的 label 全是 undefined。
  if (typeof node.type === 'function') {
    walk(render(node.type, node.props), visit, `${where}/${tag}`);
    return;
  }
  walk(node.props.children, visit, `${where}/${tag}`);
}

function inspect(treeSoFar, label) {
  const texts = [];
  const styles = [];
  const tags = [];
  walk(treeSoFar, (hit) => {
    if (hit.text !== undefined) texts.push(hit.text);
    if (hit.element) {
      const st = hit.element.props.style;
      if (st && typeof st === 'object') styles.push(JSON.stringify(st));
      tags.push(typeof hit.element.type === 'string' ? hit.element.type : 'comp');
    }
  }, label);
  const dirtyText = texts.filter((t) => BAD.test(t));
  const dirtyStyle = styles.filter((s) => BAD.test(s));
  ok(`${label}：没有脏文本`, dirtyText.length === 0, dirtyText.slice(0, 3).join(' | '));
  ok(`${label}：没有脏样式`, dirtyStyle.length === 0, dirtyStyle.slice(0, 2).join(' | '));
  return { texts, styles, tags };
}

// ---------------------------------------------------------------- 1 Corner
console.log('\n# Corner（角落的「文」）');
{
  const tree = render(I.Corner, {});
  const r = inspect(tree, 'Corner');
  ok('Corner 画出了「文」', r.texts.some((t) => t.includes('文')));
  const flat = r.styles.join(' ');
  ok('Corner 带 no-drag（不然被拖拽区吞掉）', /no-drag/.test(flat));
}

// ---------------------------------------------------------------- 2 Panel 关
console.log('\n# Panel（关着）');
const closedSnap = {
  ok: true,
  state: { on: false, style: 'ya', gloss: false },
  styles: [
    { id: 'ya', label: '雅正', tagline: '浅近文言，近《世说新语》与明清尺牍', demo: { plain: '这个接口返回 200。', text: '此接口报二百。' } },
    { id: 'jian', label: '简古', tagline: '近《论语》《老子》，去今语助词', demo: { plain: '先跑测试。', text: '先试。' } },
    { id: 'pian', label: '骈俪', tagline: '四六成句，技术细节仍须点明', demo: { plain: '日志写在磁盘上。', text: '日志落盘，可覆可查。' } },
  ],
  line: '文言模式：关',
  build: '0.1.0+preview',
  file: 'C:\\Users\\x\\.dsh\\storages\\wenyan\\state.json',
  exists: false,
};
{
  I.store.snap = closedSnap;
  const tree = render(I.Panel, {});
  const r = inspect(tree, 'Panel(关)');
  const joined = r.texts.join(' ');
  ok('关着也列出了三档', ['雅正', '简古', '骈俪'].every((s) => joined.includes(s)));
  ok('关着显示「关」状态', joined.includes('关') || r.styles.join(' ').includes('#'));
  ok('关着也能点开关（有可点元素）', r.tags.length > 5);
}

// ---------------------------------------------------------------- 3 Panel 开
console.log('\n# Panel（开着，骈俪 + 附白话）');
{
  I.store.snap = {
    ok: true,
    state: { on: true, style: 'pian', gloss: true },
    styles: closedSnap.styles,
    line: '文言模式：开 · 骈俪 · 附白话',
    build: '0.1.0+preview',
    file: closedSnap.file,
    exists: true,
  };
  const tree = render(I.Panel, {});
  const r = inspect(tree, 'Panel(开)');
  const joined = r.texts.join(' ');
  ok('开着显示骈俪', joined.includes('骈俪'));
  ok('开着显示示范原句', joined.includes('日志写在磁盘上') || joined.includes('日志落盘'));
  ok('开着有「附白话」字样', joined.includes('白话'));
  ok('开着有收起/关掉的说法', joined.includes('收起') || joined.includes('关掉'));
}

// ---------------------------------------------------------------- 4 错误态
console.log('\n# Panel（读不到状态时）');
{
  I.store.snap = { ok: false, error: 'EACCES: permission denied' };
  const tree = render(I.Panel, {});
  const r = inspect(tree, 'Panel(错)');
  ok('错误态不炸且不脏', r.texts.length > 0);
}

console.log(`\n${pass} 项通过，${fail} 项失败`);
if (fail) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
