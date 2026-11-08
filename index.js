/**
 * dsh-wenyan -- 文言模式。
 *
 * 开关一开，DSH 之后的**回答与思考链**改用文言（三档：雅正 / 简古 / 骈俪）。
 *
 * 做法不是「把界面上的字换成文言」—— 那样只会得到半文半白的怪东西。
 * 真正管用的只有一条：往系统提示里注入一段规约，让模型自己用文言写；
 * 同时把「哪些东西不许动」写死（代码 / 命令 / 路径 / 报错原文 / 数目），
 * 否则它一定会把 `npm run dev` 也翻成「行npm开役」，那就成了事故。
 *
 * 两条附带的好处：
 *   1. 只换新的 —— 规约在每回合装配时读，改了只影响之后的生成，屏幕上的旧句子不回改。
 *   2. 关掉就彻底干净 —— text() 返回空串，那段注入整个消失，不占一个字。
 *
 * 状态落在 <DSH_HOME>/storages/wenyan/state.json（插件是全局的，不该跟工作区走）。
 * 客户端（lib/client.js）两处：窗口右上角一个「文」角，右侧栏一页面板。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readState, writeState, dshHome, STYLE_IDS } from './lib/state.js';
import { promptText, describe, STYLES } from './lib/prompt.js';

export const name = 'wenyan';

/** 2026-11-04 的教训：不 import schemastery（拿不到时整个模块炸掉），默认值写死在 DEFAULTS。 */
export const inject = ['webServer'];

/** 手改；出现在 /ping 里，好判断模块缓存是不是旧的。 */
const BUILD = '0.1.0+20261108';

const PREFIX = '/wenyan';
const MAX_BODY = 32 * 1024;

const DEFAULTS = {
  // 注入块排在系统提示里的位置：靠后（越靠后越像「最新的指令」）
  order: 88,
  style: 'ya',
};

function isLoopback(req) {
  const addr = String((req.socket && (req.socket.remoteAddress || '')) || '');
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function siteAllowed(req) {
  const site = String((req.headers && req.headers['sec-fetch-site']) || '');
  if (site === '') return true;                       // 老浏览器 / curl 不带这个头
  return site === 'same-origin' || site === 'none';
}

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('body too large'));
        try { req.destroy(); } catch { /* ignore */ }
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/** 面板要的那份「状态 + 可选项」，一次给全，省得前端再写一遍文案。 */
function snapshot(home) {
  const res = readState(home);
  return {
    ok: res.ok,
    build: BUILD,
    state: res.state,
    styles: STYLE_IDS.map((id) => {
      const s = STYLES[id];
      return { id, label: s.label, tagline: s.tagline, sample: s.sample, demo: s.demo };
    }),
    file: res.file,
    exists: res.exists,
    error: res.error,
    line: describe(res.state),
  };
}

export async function apply(ctx, config) {
  const cfg = { ...DEFAULTS, ...(config || {}) };
  const home = dshHome();
  const log = (msg) => {
    try { ctx.logger?.info?.(msg); } catch { /* ignore */ }
    try { process.stderr.write(`${msg}\n`); } catch { /* ignore */ }
  };

  // ------------------------------------------------------------ 系统提示注入
  // text() 每次装配都跑一遍：磁盘上一改，下一回合就换语气，不用重启。
  // 关着的时候返回空串，等于这段注入不存在。
  const systemPrompt = typeof ctx.get === 'function' ? ctx.get('systemPrompt') : undefined;
  if (systemPrompt && typeof systemPrompt.context === 'function') {
    try {
      ctx.effect(() => systemPrompt.context({
        name: 'wenyan',
        order: Number(cfg.order) || DEFAULTS.order,
        text: () => {
          try {
            const st = readState(home).state;
            // 首次启动没配过风格就用 config 里的默认档
            if (!st.on) return '';
            if (!STYLES[st.style] && cfg.style) st.style = cfg.style;
            return promptText(st);
          } catch {
            return '';
          }
        },
      }), 'wenyan: prompt context');
    } catch (error) {
      log(`[wenyan] 注入失败：${String((error && error.message) || error)}`);
    }
  } else {
    log('[wenyan] 拿不到 systemPrompt.context，文言模式不会生效');
  }

  // ------------------------------------------------------------- HTTP 面板接口
  const resolveWebServer = () => (
    ctx.webServer || (typeof ctx.get === 'function' ? ctx.get('webServer') : undefined)
  );

  const handler = async (req, res) => {
    let url;
    try { url = new URL(req.url, 'http://127.0.0.1'); } catch { send(res, 400, { error: 'bad url' }); return; }
    const p = url.pathname;
    try {
      if (!isLoopback(req)) { send(res, 403, { error: 'loopback only' }); return; }
      if (!siteAllowed(req)) { send(res, 403, { error: 'cross-site refused' }); return; }

      if (p === `${PREFIX}/api/ping`) {
        if (req.method !== 'GET') { send(res, 405, { error: 'GET only' }); return; }
        send(res, 200, { ok: true, build: BUILD, line: snapshot(home).line });
        return;
      }

      if (p === `${PREFIX}/api/state`) {
        if (req.method !== 'GET') { send(res, 405, { error: 'GET only' }); return; }
        send(res, 200, snapshot(home));
        return;
      }

      // 唯一写盘入口。三道门：loopback、同源、自定义请求头
      // （跨源带自定义头要先过 preflight，而我们对 OPTIONS 一律 405）。
      if (p === `${PREFIX}/api/set`) {
        if (req.method !== 'POST') { send(res, 405, { error: 'POST only' }); return; }
        if (String(req.headers['x-wenyan'] || '') !== '1') { send(res, 403, { error: 'missing header' }); return; }
        if (!/^application\/json/i.test(String(req.headers['content-type'] || ''))) {
          send(res, 415, { error: 'application/json required' }); return;
        }
        let body;
        try {
          body = JSON.parse(await readBody(req, MAX_BODY) || '{}');
        } catch (error) {
          send(res, 400, { error: `bad body: ${error.message}` });
          return;
        }
        const patch = {};
        if (body && typeof body.on === 'boolean') patch.on = body.on;
        if (body && typeof body.gloss === 'boolean') patch.gloss = body.gloss;
        if (body && typeof body.paper === 'boolean') patch.paper = body.paper;
        if (body && typeof body.ui === 'boolean') patch.ui = body.ui;
        if (body && typeof body.style === 'string') {
          if (!STYLE_IDS.includes(body.style)) { send(res, 400, { error: `unknown style: ${body.style}` }); return; }
          patch.style = body.style;
        }
        if (!Object.keys(patch).length) { send(res, 400, { error: 'nothing to set (on / style / gloss / paper / ui)' }); return; }
        const out = writeState(home, patch);
        if (!out.ok) { send(res, 500, { ok: false, error: out.error }); return; }
        send(res, 200, snapshot(home));
        return;
      }

      send(res, 404, { error: 'no route', path: p });
    } catch (error) {
      try { send(res, 500, { error: String((error && error.message) || error) }); } catch { /* ignore */ }
    }
  };

  let tried = 0;
  const attach = () => {
    const webServer = resolveWebServer();
    if (!webServer || typeof webServer.register !== 'function') {
      tried += 1;
      if (tried > 40) {
        log('[wenyan] 一直没等到 webServer，右侧栏面板不会出现（文言模式本身仍可用）');
        return;
      }
      // 冷启动时 apply() 可能早于 webServer 就绪；退避重试，别把面板静默丢掉。
      const timer = setTimeout(attach, 150);
      if (typeof timer.unref === 'function') timer.unref();
      return;
    }
    try {
      const dispose = webServer.register({ kind: 'prefix', path: PREFIX, handler });
      ctx.effect?.(() => dispose, 'wenyan: http routes');
      const port = webServer.port;
      if (port) log(`[wenyan] 面板接口 http://127.0.0.1:${port}${PREFIX}/api/state`);
    } catch (error) {
      log(`[wenyan] webServer 注册失败：${String((error && error.message) || error)}`);
    }
  };
  attach();

  // ---------------------------------------------------------------- 会话里的工具
  // 让模型自己也能开关（「说人话」之后顺手关掉）。
  import('@deepseek-ai/dsh-tools').then(({ defineTool }) => {
    const tools = typeof ctx.get === 'function' ? ctx.get('tools') : undefined;
    if (!tools || typeof tools.register !== 'function') return;
    tools.register(defineTool({
      name: 'wenyan_mode',
      description:
        '文言模式的开关与档位：action=on 开、off 关、status 看状态、style 换风格（ya 雅正 / jian 简古 / pian 骈俪）。'
        + '开了之后，回答与思考链只在**之后的回合**改用文言，已出的话不回改。'
        + ' / Toggle Classical-Chinese reply mode.',
      parameters: {
        action: { type: 'string', required: true, description: 'on | off | status | style | look' },
        style: { type: 'string', description: 'action=style 时的档位：ya | jian | pian' },
        gloss: { type: 'boolean', description: '是否每段末附一句白话' },
        paper: { type: 'boolean', description: '开了之后整页是否换成纸黄色' },
        ui: { type: 'boolean', description: '开了之后界面短词（新会话/发送/删除…）是否也换文言' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: String(value) }],
      },
      execute: async (args) => {
        const action = String(args?.action || 'status').toLowerCase();
        const before = readState(home).state;
        if (action === 'status') {
          return [describe(before), `文件：${path.join(home, 'storages', 'wenyan', 'state.json')}`].join('\n');
        }
        if (action === 'on' || action === 'off') {
          const out = writeState(home, { on: action === 'on' });
          return out.ok ? `${describe(out.state)}（下一回合起生效）` : `写不进去：${out.error}`;
        }
        if (action === 'look') {
          const patch = {};
          if (typeof args?.paper === 'boolean') patch.paper = args.paper;
          if (typeof args?.ui === 'boolean') patch.ui = args.ui;
          if (!Object.keys(patch).length) return `没说什么要改：${describe(before)}`;
          const out = writeState(home, patch);
          return out.ok ? `${describe(out.state)}` : `写不进去：${out.error}`;
        }
        if (action === 'style') {
          const style = String(args?.style || '').toLowerCase();
          if (!STYLE_IDS.includes(style)) return `没有这一档：${style || '(空)'}；可选 ${STYLE_IDS.join(' / ')}`;
          const out = writeState(home, { style });
          return out.ok ? `${describe(out.state)}` : `写不进去：${out.error}`;
        }
        return `未知 action：${action}（on | off | status | style | look）`;
      },
    }));
  }).catch((error) => {
    log(`[wenyan] 工具注册跳过：${String((error && error.message) || error)}`);
  });
}
