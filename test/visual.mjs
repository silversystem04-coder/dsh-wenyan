/**
 * 出图：node test/visual.mjs [state.json] [out.png]
 *
 * 没有 puppeteer、也没有现成的 React UMD，所以这里自带两样东西：
 *   1) 一个「迷你 React」——state 真存、effect 真跑、setState 会重渲染；
 *   2) 一个把 React 元素树序列化成 HTML 字符串的小函数。
 * fetch 被换成直接读 lib/state.js 与 lib/prompt.js，所以画出来的是真数据。
 *
 * 产出 test/visual.html，用 Edge 无头截：见 README 里那条命令。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const bundle = fs.readFileSync(path.join(root, 'lib', 'client.js'), 'utf8');

const stateMod = await import('../lib/state.js');
const promptMod = await import('../lib/prompt.js');

// 想画「开着」的样子就传一个临时的 DSH_HOME，里面放一份 state.json。
const fakeHome = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'wenyan-visual-'));
process.env.DSH_HOME = fakeHome;
if (process.argv[2]) {
  // 把用户给的 state.json 放进临时 home，读完就删，不留痕。
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wenyan-visual-'));
  fs.mkdirSync(path.join(tmp, 'storages', 'wenyan'), { recursive: true });
  fs.copyFileSync(process.argv[2], path.join(tmp, 'storages', 'wenyan', 'state.json'));
  process.env.DSH_HOME = tmp;
}
const outFile = process.argv[3] || path.join(here, 'visual.html');

// ------------------------------------------------------------ 迷你 React
const hooks = { list: [], index: 0 };
let rerender = null;
function resetHooks() { hooks.list = []; hooks.index = 0; }
const React = {
  createElement(type, props, ...children) {
    const kids = [];
    for (const c of children) if (c !== null && c !== undefined && c !== false) kids.push(c);
    return { type, props: Object.assign({}, props, { children: kids.length === 1 ? kids[0] : (kids.length ? kids : undefined) }) };
  },
  Fragment: 'Fragment',
  useState(init) {
    const i = hooks.index++;
    if (!(i in hooks.list)) hooks.list[i] = typeof init === 'function' ? init() : init;
    const set = (v) => {
      const next = typeof v === 'function' ? v(hooks.list[i]) : v;
      if (next === hooks.list[i]) return;
      hooks.list[i] = next;
      if (rerender) rerender();
    };
    return [hooks.list[i], set];
  },
  useRef(v) { const i = hooks.index++; if (!(i in hooks.list)) hooks.list[i] = { current: v }; return hooks.list[i]; },
  useMemo(fn) { return fn(); },
  useCallback(fn) { return fn; },
  useEffect(fn) { const i = hooks.index++; if (!(i in hooks.list)) { hooks.list[i] = true; if (fn()) hooks.list['clean' + i] = fn(); } },
  useLayoutEffect(fn) { React.useEffect(fn); },
};

// ------------------------------------------------------------ 装 bundle
let factoryMod = null;
globalThis.window = { __ModuleLoader__: { load(spec) { factoryMod = spec; } } };
const requireShim = (n) => {
  if (n === 'react') return React;
  throw new Error(`unexpected require(${n})`);
};
new Function('module', 'exports', 'require', 'window', 'React', bundle)(
  { exports: {} }, {}, requireShim, globalThis.window, React,
);
const I = factoryMod.factory(requireShim, { exports: {} }).__internals;

// ------------------------------------------------------------ 假 fetch
const realState = stateMod.readState();
const snapData = {
  ok: true,
  state: realState.state,
  styles: stateMod.STYLE_IDS.map((id) => promptMod.STYLES[id]),
  line: promptMod.describe(realState.state),
  build: '0.1.0+preview',
  file: realState.file,
  exists: realState.exists,
};
globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('/state')) return { ok: true, json: async () => snapData };
  if (u.includes('/set')) return { ok: true, json: async () => snapData };
  return { ok: true, json: async () => ({ ok: true }) };
};

// 序列化只画一遍、不重渲染，所以先把数据塞进 store —— 真跑时是 effect 里 load() 填的。
I.store.snap = snapData;

// ------------------------------------------------------------ 序列化
function css(style) {
  if (!style) return '';
  return Object.keys(style).map((k) => {
    const v = style[k];
    if (v === null || v === undefined || v === false) return '';
    if (typeof v === 'number' && !/^(flex|zIndex|opacity|order|lineHeight)$/.test(k)) return `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}px`;
    return `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`;
  }).filter(Boolean).join(';');
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function toHtml(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return esc(node);
  if (Array.isArray(node)) return node.map(toHtml).join('');
  if (typeof node === 'function') return toHtml(renderOnce(node, {}));
  if (!node.props) return '';
  // 函数组件（比如风格 chip）要带着 props 真跑一遍，否则只有个空 div。
  if (typeof node.type === 'function') return toHtml(renderOnce(node.type, node.props));
  const { children, style, ...rest } = node.props;
  const attrs = Object.keys(rest)
    .filter((k) => /^(className|title|placeholder)$/.test(k))
    .map((k) => `${k === 'className' ? 'class' : k}="${esc(rest[k])}"`).join(' ');
  const st = style ? ` style="${esc(css(style))}"` : '';
  const tag = typeof node.type === 'string' ? node.type : 'div';
  const voidTag = /^(input|img|br|hr)$/.test(tag);
  const inner = voidTag ? '' : toHtml(children);
  return `<${tag}${attrs}${st}>${inner}</${tag}>`;
}

function renderOnce(component, props) {
  resetHooks();
  const prev = globalThis.React;
  globalThis.React = React;
  try { return component(props || {}); } finally { globalThis.React = prev; }
}

// ------------------------------------------------------------ 画两屏
const panelHtml = toHtml(renderOnce(I.Panel, {}));
const cornerHtml = toHtml(renderOnce(I.Corner, {}));

const page = `<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>dsh-wenyan preview</title>
<style>
  :root {
    --dsw-alias-label-primary: #1b1b1b;
    --dsw-alias-label-secondary: #4a4a4a;
    --dsw-alias-label-tertiary: #8a8a8a;
    --dsw-alias-border-l1: #e6e6e6;
    --dsw-alias-border-l2: #d6d6d6;
    --dsw-alias-bg-base: #ffffff;
    --dsw-alias-bg-layer-1: #ffffff;
    --dsw-alias-bg-layer-2: #fafafa;
    --dsw-alias-brand-primary: #3b6ef0;
    --dsw-alias-state-error-primary: #d14343;
    --dsw-alias-state-success-primary: #1f9d55;
  }
  html, body { margin: 0; padding: 0; background: #f2f2f2; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
  .stage { display: flex; gap: 26px; padding: 26px; align-items: flex-start; }
  .col { width: 320px; height: 720px; border-radius: 12px; overflow: hidden; box-shadow: 0 8px 26px rgba(0,0,0,.10); background: #fff; }
  .win { position: relative; width: 420px; height: 720px; border-radius: 12px; background: #fff; box-shadow: 0 8px 26px rgba(0,0,0,.10); }
  .cap { font-size: 12px; color: #888; margin: 0 0 8px 2px; }
  .wrap { display: flex; flex-direction: column; }
</style></head>
<body><div class="stage">
  <div class="wrap"><div class="cap">右侧栏 · 文言页</div><div class="col">${panelHtml}</div></div>
  <div class="wrap"><div class="cap">窗口右上角的「文」角</div><div class="win"><div style="position:relative;height:44px;border-bottom:1px solid #eee">&nbsp;</div>${cornerHtml}</div></div>
</div></body></html>`;

fs.writeFileSync(outFile, page, 'utf8');
console.log(`state  ${realState.exists ? '开' : '关'} · ${JSON.stringify(realState.state)}`);
console.log(`wrote ${outFile}`);
process.exit(0);
