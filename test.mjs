/**
 * 自检：node test.mjs
 *
 * 覆盖三块 ——
 *   状态层：默认关、写读一致、脏数据容错、原子写、备份
 *   提示层：关着返回空串、开着带齐规矩、三档风格确实不同、附白话才加第七条
 *   接口层：真 apply() + 真 HTTP 服务，把四道门与三条路由都打一遍
 *
 * 环境：每个用例都把 DSH_HOME 指到临时目录，绝不碰真的 ~/.dsh。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass += 1; console.log(`  PASS ${name}`); return; }
  fail += 1;
  failures.push(name + (detail ? ` — ${detail}` : ''));
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
}
function eq(name, actual, expect) {
  ok(name, JSON.stringify(actual) === JSON.stringify(expect), `got ${JSON.stringify(actual)}`);
}

/** 每个用例一个干净的 DSH_HOME。 */
function freshHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wenyan-'));
  process.env.DSH_HOME = dir;
  return dir;
}

const state = await import('./lib/state.js');
const prompt = await import('./lib/prompt.js');

// ------------------------------------------------------------ 1 状态层
console.log('\n# 状态层');
{
  const home = freshHome();
  const r = state.readState(home);
  ok('没文件时 ok=true', r.ok === true);
  ok('没文件时 exists=false', r.exists === false);
  eq('默认关且是雅正', { on: r.state.on, style: r.state.style, gloss: r.state.gloss },
    { on: false, style: 'ya', gloss: false });
  ok('默认要纸色', r.state.paper === true);
  ok('默认要界面文言', r.state.ui === true);
}
{
  const home = freshHome();
  const w = state.writeState(home, { on: true, paper: false, ui: false });
  ok('纸色与界面文言都能关', w.ok === true && w.state.paper === false && w.state.ui === false);
  const back = state.readState(home).state;
  ok('关掉的能读回来', back.paper === false && back.ui === false);
  const one = state.writeState(home, { paper: true }).state;
  ok('只改一个不影响另一个', one.paper === true && one.ui === false);
  // 脏值/缺字段都要退回「要」：旧的状态文件没有这两个键，也应该有纸色
  ok('脏值归一成真', state.normalize({ on: true, paper: 'nope', ui: 0 }).paper === true);
  ok('缺字段归一成真', state.normalize({ on: true }).ui === true);
}
{
  const home = freshHome();
  const w = state.writeState(home, { on: true, style: 'pian' });
  ok('写入成功', w.ok === true);
  ok('文件真的落了盘', fs.existsSync(state.statePath(home)));
  const r = state.readState(home);
  eq('读回来一致', { on: r.state.on, style: r.state.style }, { on: true, style: 'pian' });
  ok('带 updatedAt', typeof r.state.updatedAt === 'string');
}
{
  const home = freshHome();
  state.writeState(home, { on: true });
  const w2 = state.writeState(home, { on: false });
  ok('二次写入成功', w2.ok === true);
  ok('留了 .bak', fs.existsSync(state.statePath(home) + '.bak'));
  eq('只有最后一个赢', state.readState(home).state.on, false);
}
{
  const home = freshHome();
  const dir = path.dirname(state.statePath(home));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(state.statePath(home), '{ 这不是 JSON', 'utf8');
  const r = state.readState(home);
  ok('坏 JSON：ok=false（老实报错）', r.ok === false);
  ok('坏 JSON：仍然给默认状态，不炸', r.state.on === false && r.state.style === 'ya');
  ok('坏 JSON：error 有内容', typeof r.error === 'string' && r.error.length > 0);
  const w = state.writeState(home, { on: true });
  ok('坏文件也能覆盖修好', w.ok === true && state.readState(home).state.on === true);
}
{
  // 脏字段：style 不认识、on 是字符串、gloss 是 1
  const n = state.normalize({ on: 'yes', style: 'guwen', gloss: 1 });
  eq('脏字段被揉回默认', { on: n.on, style: n.style, gloss: n.gloss }, { on: false, style: 'ya', gloss: false });
  const n2 = state.normalize({ on: true, style: 'jian', gloss: true });
  eq('合法字段保留', { on: n2.on, style: n2.style, gloss: n2.gloss }, { on: true, style: 'jian', gloss: true });
}

// ------------------------------------------------------------ 2 提示层
console.log('\n# 提示层');
{
  ok('关着返回空串', prompt.promptText({ on: false, style: 'ya', gloss: false }) === '');
  ok('没有状态也返回空串', prompt.promptText(null) === '');
}
{
  const text = prompt.promptText({ on: true, style: 'ya', gloss: false });
  ok('开着有开头标', text.includes('【文言模式 · 开】'));
  ok('说清只换新句', text.includes('只换新句'));
  ok('护住代码与路径', text.includes('代码、命令、路径'));
  ok('护住报错原文', text.includes('报错原文'));
  ok('说清以文言答白话问', text.includes('彼以白话问'));
  ok('留下「说人话」的出口', text.includes('说人话'));
  ok('带当前档位名', text.includes('雅正'));
  ok('不附白话时不出现白话条款', !text.includes('每段末附白话一句'));
  ok('不算太长（< 1400 字）', text.length < 1400, `len=${text.length}`);
}
{
  const ya = prompt.promptText({ on: true, style: 'ya' });
  const jian = prompt.promptText({ on: true, style: 'jian' });
  const pian = prompt.promptText({ on: true, style: 'pian' });
  ok('三档文本互不相同', ya !== jian && jian !== pian && ya !== pian);
  ok('简古提到去今语助词', jian.includes('今语助词'));
  ok('骈俪要求技术细节仍须点明', pian.includes('技术细节仍须点明'));
  ok('未知档位退回雅正', prompt.promptText({ on: true, style: 'nope' }) === ya);
}
{
  const g = prompt.promptText({ on: true, style: 'ya', gloss: true });
  ok('附白话时加第八条', g.includes('八、每段末附白话一句'));
  ok('附白话时文本更长', g.length > prompt.promptText({ on: true, style: 'ya' }).length);
}
{
  eq('describe 关', prompt.describe({ on: false }), '文言模式：关');
  ok('describe 开带档位', prompt.describe({ on: true, style: 'pian' }).includes('骈俪'));
  ok('describe 开带附白话', prompt.describe({ on: true, style: 'ya', gloss: true }).includes('附白话'));
}

// ------------------------------------------------------------ 3 接口层
console.log('\n# 接口层');
{
  const home = freshHome();
  const mod = await import('./index.js');
  ok('模块导出 name', mod.name === 'wenyan');
  ok('声明了 inject=webServer', Array.isArray(mod.inject) && mod.inject.indexOf('webServer') >= 0);

  let spec = null;
  const fakeCtx = {
    logger: { info() {} },
    effect(fn) { try { const d = fn(); return d; } catch (e) { return undefined; } },
    get(name) {
      if (name === 'webServer') return { register(s) { spec = s; return () => {}; }, port: 0 };
      if (name === 'tools') return null;
      return undefined;
    },
  };
  await mod.apply(fakeCtx, {});
  ok('注册了 prefix 路由', spec && spec.kind === 'prefix');
  eq('路由挂在 /wenyan', spec && spec.path, '/wenyan');

  const server = http.createServer((req, res) => { res.setHeader('connection', 'close'); spec.handler(req, res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/wenyan/api`;
  const call = async (p, opts = {}) => {
    const res = await fetch(base + p, opts);
    let body = null;
    try { body = await res.json(); } catch { /* 可能没有 body */ }
    return { code: res.status, body };
  };

  const ping = await call('/ping');
  eq('GET /ping 200', ping.code, 200);
  ok('ping 带 build', typeof ping.body.build === 'string' && ping.body.build.startsWith('0.1.'));
  eq('ping 初始是关', ping.body.line, '文言模式：关');

  const st0 = await call('/state');
  eq('GET /state 200', st0.code, 200);
  eq('给三档风格', st0.body.styles.map((s) => s.id), ['ya', 'jian', 'pian']);
  ok('每档带示范句', st0.body.styles.every((s) => s.demo && s.demo.plain && s.demo.text));
  ok('初始 exists=false', st0.body.exists === false);

  const noHeader = await call('/set', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ on: true }),
  });
  eq('缺 x-wenyan 头 → 403', noHeader.code, 403);

  const badType = await call('/set', {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'x-wenyan': '1' },
    body: '{"on":true}',
  });
  eq('非 JSON content-type → 415', badType.code, 415);

  const badBody = await call('/set', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-wenyan': '1' },
    body: '{oops',
  });
  eq('坏 body → 400', badBody.code, 400);

  const empty = await call('/set', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-wenyan': '1' },
    body: '{}',
  });
  eq('空 patch → 400', empty.code, 400);

  const wall = await call('/set', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-wenyan': '1' },
    body: JSON.stringify({ style: 'guwen' }),
  });
  eq('未知风格 → 400', wall.code, 400);

  const on = await call('/set', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-wenyan': '1' },
    body: JSON.stringify({ on: true, style: 'jian' }),
  });
  eq('开 → 200', on.code, 200);
  ok('开了之后 state.on=true', on.body.state.on === true);
  eq('风格记住', on.body.state.style, 'jian');
  ok('落盘了', fs.existsSync(state.statePath(home)));
  ok('line 变开', on.body.line.includes('文言模式：开') && on.body.line.includes('简古'));

  const gloss = await call('/set', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-wenyan': '1' },
    body: JSON.stringify({ gloss: true }),
  });
  eq('只改 gloss 不把 on 改掉', gloss.body.state.on, true);
  eq('gloss 生效', gloss.body.state.gloss, true);

  const look = await call('/set', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-wenyan': '1' },
    body: JSON.stringify({ paper: false }),
  });
  eq('纸色能关', look.body.state.paper, false);
  eq('关纸色不把界面文言也关掉', look.body.state.ui, true);
  eq('关纸色不把开关也关掉', look.body.state.on, true);

  const getSet = await call('/set');
  eq('GET /set → 405', getSet.code, 405);

  const cross = await call('/state', { headers: { 'sec-fetch-site': 'cross-site' } });
  eq('跨站 → 403', cross.code, 403);

  const nf = await call('/nope');
  eq('未知路由 → 404', nf.code, 404);

  // 注入文本随状态走
  const after = prompt.promptText(state.readState(home).state);
  ok('开且附白话后，注入里有第八条', after.includes('八、每段末附白话一句'));

  await new Promise((r) => server.close(r));
}

console.log(`\n${pass} 项通过，${fail} 项失败`);
if (fail) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
