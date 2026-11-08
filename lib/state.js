/**
 * 文言模式的状态：就一个开关 + 一档风格 + 一个「附白话」的勾。
 *
 * 存哪儿：<DSH_HOME>/storages/wenyan/state.json
 * 为什么不用 brain/journal/：那是工作区的私有数据，插件是全局的；
 * 换个工作区，这个开关不该跟着变。
 *
 * 读的时候永远容错：文件没了、JSON 坏了、字段是脏的，统统退回默认（关）。
 * 一个「让界面换个语气」的开关，不该因为一个坏字节把会话搞挂。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const STYLE_IDS = ['ya', 'jian', 'pian'];

export const DEFAULT_STATE = Object.freeze({
  on: false,
  style: 'ya',
  gloss: false,
  // 开了之后，界面也跟着变：纸色底 + 按钮那类短词换文言。这两条可以各自关掉。
  paper: true,
  ui: true,
});

export function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

export function statePath(home = dshHome()) {
  return path.join(home, 'storages', 'wenyan', 'state.json');
}

/** 把任意输入揉成一份合法状态：多余字段丢掉，缺的补默认。 */
export function normalize(input) {
  const s = input && typeof input === 'object' ? input : {};
  return {
    on: s.on === true,
    style: STYLE_IDS.includes(s.style) ? s.style : DEFAULT_STATE.style,
    gloss: s.gloss === true,
    // 只有明确写 false 才算关；缺字段或脏值一律当真（默认要纸色）
    paper: s.paper !== false,
    ui: s.ui !== false,
    updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : null,
  };
}

export function readState(home = dshHome()) {
  const file = statePath(home);
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ok: true, file, exists: true, state: normalize(parsed), error: null };
  } catch (error) {
    const code = error && error.code;
    if (code === 'ENOENT') {
      return { ok: true, file, exists: false, state: normalize(null), error: null };
    }
    // 坏 JSON：当作「从没开过」，但要老实说一声
    return {
      ok: false,
      file,
      exists: true,
      state: normalize(null),
      error: String((error && error.message) || error),
    };
  }
}

/**
 * 写状态。只接受 on / style / gloss 三个键，别的忽略。
 * 先写 .tmp 再 rename；旧文件留一份 .bak —— 手改坏了还能捞回来。
 */
export function writeState(home, patch) {
  const file = statePath(home);
  const current = readState(home);
  const merged = { ...current.state };
  for (const key of ['on', 'style', 'gloss', 'paper', 'ui']) {
    if (patch && Object.prototype.hasOwnProperty.call(patch, key)) merged[key] = patch[key];
  }
  merged.updatedAt = new Date().toISOString();
  const next = normalize(merged);

  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    if (current.exists) {
      try { fs.copyFileSync(file, `${file}.bak`); } catch { /* 备份失败不影响写入 */ }
    }
    fs.renameSync(tmp, file);
    return { ok: true, file, state: next, error: null };
  } catch (error) {
    return {
      ok: false,
      file,
      state: current.state,
      error: String((error && error.message) || error),
    };
  }
}
