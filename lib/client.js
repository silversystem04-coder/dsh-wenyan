/**
 * dsh-wenyan -- 浏览器半边。
 *
 * 两处界面，共用同一个状态：
 *   1. 右上角一个「文」角（挂 shell.overlay，帧级浮层）。关着是灰框，开着是墨底白字。
 *      点一下即开；开完顺手把右侧栏那页面板拉出来 —— 这样一开就有地方关。
 *   2. 右侧栏一页「文言」：（大开关 / 三档风格 / 附白话 / 关掉并收起）。
 *
 * 手写 ModuleLoader bundle，没有打包器（与 dsh-memory-map / dsh-ai-journal 同一办法）。
 */

window.__ModuleLoader__.load({
  id: 'dsh-wenyan',
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require('react');
    var h = React.createElement;

    var TAB_ID = 'dsh-wenyan';
    var TAB_KIND = 'wenyan';
    var NS = 'wenyan';
    var PREFIX = '/wenyan/api';

    // --------------------------------------------------------------- 文案
    var zh = {
      tab: '文言',
      guide: '把回答与思考链换成文言，随时关掉',
      title: '文言模式',
      on: '已开',
      off: '已关',
      switchOn: '开',
      switchOff: '关',
      style: '风格',
      gloss: '每段末附一句白话',
      look: '开着时界面',
      paper: '整页换纸色',
      uiWords: '按钮短词也用文言',
      hintOn: '本轮之后的回答与思考改用文言；已经印出来的句子不回改。',
      hintOff: '默认关。开了之后，右上角的「文」角变墨色，右侧栏这页也在。',
      close: '关掉并收起',
      refresh: '刷新',
      file: '状态文件',
      loading: '读 …',
      failed: '读不到',
      demo: '示范',
      justNow: '已改，下一回合起生效',
    };
    var en = {
      tab: 'Classical',
      guide: 'Reply and reasoning in Classical Chinese, off anytime',
      title: 'Classical Chinese mode',
      on: 'on',
      off: 'off',
      switchOn: 'on',
      switchOff: 'off',
      style: 'Register',
      gloss: 'Add a one-line plain gloss per paragraph',
      look: 'Look while on',
      paper: 'Paper-colour page',
      uiWords: 'Classical UI labels',
      hintOn: 'Only new replies and reasoning switch; text already on screen stays.',
      hintOff: 'Off by default. When on, the corner glyph turns ink-black.',
      close: 'Turn off & collapse',
      refresh: 'Reload',
      file: 'State file',
      loading: 'reading …',
      failed: 'unavailable',
      demo: 'Sample',
      justNow: 'Saved; takes effect next turn',
    };
    var T = (typeof navigator !== 'undefined' && /^en\b/i.test(navigator.language || '')) ? en : zh;
    function t(k) { return T[k] || k; }

    // --------------------------------------------------------------- 颜色
    var INK = 'var(--dsw-alias-label-primary)';
    var LABEL = INK;
    var LABEL2 = 'var(--dsw-alias-label-secondary)';
    var LABEL3 = 'var(--dsw-alias-label-tertiary)';
    var BORDER = 'var(--dsw-alias-border-l1)';
    var BORDER2 = 'var(--dsw-alias-border-l2)';
    var BG = 'var(--dsw-alias-bg-layer-1)';
    var BG2 = 'var(--dsw-alias-bg-layer-2)';
    var BRAND = 'var(--dsw-alias-brand-primary)';
    var ERR = 'var(--dsw-alias-state-error-primary)';
    var OK = 'var(--dsw-alias-state-success-primary)';

    var S = {
      chip: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 22, boxSizing: 'border-box',
        border: '1px solid ' + BORDER2, borderRadius: 6,
        background: BG, color: LABEL2,
        fontSize: 13, fontWeight: 600, lineHeight: '20px',
        cursor: 'pointer', userSelect: 'none',
        fontFamily: '"Songti SC", "SimSun", "Source Han Serif SC", serif',
        transition: 'background .15s ease, color .15s ease, border-color .15s ease, transform .1s ease',
        WebkitAppRegion: 'no-drag',
      },
      chipOn: {
        background: '#1e1b18', color: '#f6f1e7', borderColor: '#1e1b18',
        boxShadow: '0 1px 6px rgba(0,0,0,.22)',
      },
      root: {
        display: 'flex', flexDirection: 'column', height: '100%',
        minHeight: 0, fontFamily: 'inherit', color: LABEL,
        background: BG,
      },
      head: {
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px 8px', borderBottom: '1px solid ' + BORDER,
      },
      title: { fontSize: 13, fontWeight: 600, letterSpacing: '.3px' },
      stateWord: { fontSize: 11, color: LABEL3 },
      body: { flex: 1, overflowY: 'auto', padding: '12px 12px 16px', minHeight: 0 },
      card: {
        border: '1px solid ' + BORDER, borderRadius: 9, background: BG2,
        padding: '10px 11px', marginBottom: 10,
      },
      row: { display: 'flex', alignItems: 'center', gap: 8 },
      grow: { flex: 1, minWidth: 0 },
      bigSwitch: {
        position: 'relative', width: 46, height: 26, borderRadius: 13,
        border: '1px solid ' + BORDER2, background: BG, cursor: 'pointer',
        flex: '0 0 auto', transition: 'background .16s ease, border-color .16s ease',
      },
      bigSwitchOn: { background: '#1e1b18', borderColor: '#1e1b18' },
      knob: {
        position: 'absolute', top: 3, left: 3, width: 18, height: 18, borderRadius: 9,
        background: 'var(--dsw-alias-bg-base)', transition: 'left .16s ease',
        boxShadow: '0 1px 2px rgba(0,0,0,.2)',
      },
      knobOn: { left: 23 },
      styleChip: {
        padding: '5px 10px', borderRadius: 7, border: '1px solid ' + BORDER2,
        background: BG, color: LABEL2, cursor: 'pointer', fontSize: 12,
        fontFamily: '"Songti SC", "SimSun", serif',
      },
      styleChipOn: { borderColor: INK, color: INK, background: 'rgba(30,27,24,.06)', fontWeight: 600 },
      tagline: { fontSize: 11, color: LABEL3, marginTop: 7 },
      demoBox: { marginTop: 6, padding: '8px 9px', borderRadius: 7, background: BG, border: '1px solid ' + BORDER },
      demoPlain: { fontSize: 11.5, color: LABEL3, lineHeight: '18px' },
      demoText: {
        fontSize: 12.5, color: LABEL, lineHeight: '20px', marginTop: 4,
        fontFamily: '"Songti SC", "SimSun", "Source Han Serif SC", serif',
      },
      cbRow: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: LABEL2, cursor: 'pointer', padding: '2px 0' },
      sect: { fontSize: 11, color: LABEL3, letterSpacing: 0.4, margin: '10px 0 6px' },
      box: {
        width: 14, height: 14, borderRadius: 4, border: '1px solid ' + BORDER2,
        background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, color: '#fff', flex: '0 0 auto',
      },
      boxOn: { background: INK, borderColor: INK },
      hint: { fontSize: 11, color: LABEL3, lineHeight: '17px', marginTop: 9 },
      btn: {
        padding: '5px 9px', borderRadius: 7, border: '1px solid ' + BORDER2,
        background: BG, color: LABEL2, cursor: 'pointer', fontSize: 11.5,
      },
      btnDanger: { color: ERR, borderColor: 'rgba(220,60,60,.35)' },
      foot: { marginTop: 10, fontSize: 10.5, color: LABEL3, wordBreak: 'break-all', lineHeight: '16px' },
      err: { color: ERR, fontSize: 11.5, marginBottom: 8 },
      flash: { fontSize: 11, color: OK, marginTop: 8 },
    };

    // ------------------------------------------------------------- transport
    function api(path, options) {
      var opts = options || {};
      var headers = { 'x-wenyan': '1' };
      if (opts.body) headers['content-type'] = 'application/json';
      return fetch(PREFIX + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: 'no-store',
      }).then(function (res) {
        return res.json().then(function (json) {
          if (!res.ok) throw new Error((json && (json.error || json.message)) || ('HTTP ' + res.status));
          return json;
        });
      });
    }

    // 角与面板是两个组件树，靠这个小 store 对齐状态，别各拉各的。
    var store = { snap: null, at: 0, error: '', listeners: [], busy: false };
    function emit() { store.listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { /* ignore */ } }); }
    function subscribe(fn) {
      store.listeners.push(fn);
      return function () {
        var i = store.listeners.indexOf(fn);
        if (i >= 0) store.listeners.splice(i, 1);
      };
    }
    function load(force) {
      var now = Date.now();
      if (!force && store.snap && now - store.at < 2500) return Promise.resolve(store.snap);
      return api('/state').then(function (snap) {
        store.snap = snap; store.at = Date.now(); store.error = ''; emit();
        return snap;
      }).catch(function (e) {
        store.error = String((e && e.message) || e); emit();
        return store.snap;
      });
    }
    function set(patch) {
      store.busy = true; emit();
      return api('/set', { method: 'POST', body: patch }).then(function (snap) {
        store.snap = snap; store.at = Date.now(); store.error = ''; store.busy = false; emit();
        return snap;
      }).catch(function (e) {
        store.busy = false; store.error = String((e && e.message) || e); emit();
        throw e;
      });
    }
    function useStore() {
      var pair = React.useState(0);
      var bump = pair[1];
      React.useEffect(function () {
        var off = subscribe(function () { bump(function (n) { return n + 1; }); });
        load(false);
        var timer = setInterval(function () { load(false); }, 4000);
        return function () { off(); clearInterval(timer); };
      }, []);
      return store;
    }

    // ------------------------------------------------------- 纸色 · 界面文言
    //
    // 两件事都只动「看得见的东西」，一个字节的数据也不碰：
    //   纸色：整个应用的颜色都从 --dsw-alias-* 这批 CSS 变量取，换掉根上的变量
    //         就整体变黄，不用逐个组件去改（也不怕别人新加的组件不听话）。
    //   界面文言：只对**短**文本节点做「整串精确替换」。长句、代码、输入框、
    //         引号里的原文一律不动 —— 词表替换干不了翻译，但按钮上那两三个字够用。
    var PAPER_CSS = [
      'html.wy-paper {',
      '  --dsw-alias-bg-base: #f4ecd8 !important;',
      '  --dsw-alias-bg-layer-1: #f7f1e1 !important;',
      '  --dsw-alias-bg-layer-2: #efe5ce !important;',
      '  --dsw-alias-bg-layer-3: #eadfc4 !important;',
      '  --dsw-alias-label-primary: #2b2620 !important;',
      '  --dsw-alias-label-secondary: #574d40 !important;',
      '  --dsw-alias-label-tertiary: #8a7c66 !important;',
      '  --dsw-alias-border-l1: #e3d8bd !important;',
      '  --dsw-alias-border-l2: #d2c4a4 !important;',
      '  --dsw-alias-brand-primary: #8a5326 !important;',
      '  background: #f4ecd8 !important;',
      '}',
      'html.wy-paper body {',
      '  background: #f4ecd8 !important;',
      '  color: #2b2620 !important;',
      '  font-family: "Songti SC", "SimSun", "Source Han Serif SC", "Noto Serif CJK SC", serif !important;',
      '}',
      // 聊天正文的代码块不许被衬线字体带跑
      'html.wy-paper pre, html.wy-paper code, html.wy-paper kbd, html.wy-paper textarea {',
      '  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;',
      '}',
      // 一层极淡的纸纹：两条几乎看不见的斜线，靠 background-blend 压住
      'html.wy-paper body {',
      '  background-image: repeating-linear-gradient(0deg, rgba(150,120,60,.035) 0 1px, transparent 1px 3px) !important;',
      '}',
    ].join('\n');

    // 键要用「整串完全相等」才换：'发送' 会换，'我要发送了' 不会。
    var WORDS = {
      '新会话': '新开一话',
      '新建会话': '新开一话',
      '发送': '呈上',
      '停止': '止住',
      '重试': '再试',
      '复制': '誊录',
      '编辑': '校改',
      '删除': '删去',
      '保存': '存下',
      '取消': '作罢',
      '确定': '便是',
      '关闭': '合上',
      '收起': '掩上',
      '展开': '打开',
      '搜索': '检寻',
      '更多': '其余',
      '全部': '尽数',
      '今天': '今日',
      '昨天': '昨日',
      '加载中': '载入中',
      '思考中': '思量中',
      '思考': '思量',
      '回答': '答语',
      '上传': '呈上',
      '下载': '取下',
      '附件': '附卷',
      '图片': '图画',
      '终端': '终端',
      '权限': '权限',
      '允许': '许之',
      '拒绝': '却之',
      '继续': '接着',
      '暂停': '暂歇',
      '工作区': '作场',
      '重命名': '更名',
      '清空': '涤尽',
      '刷新': '更迭',
      '退出': '告退',
      '登录': '入内',
      '帮助': '相助',
      '账户': '户名',
      '账号': '户名',
      '设置': '设置',
      '偏好设置': '所好之设',
    };

    var classic = { paperOn: false, wordsOn: false, styleEl: null, observer: null, busy: false, saved: null };

    function ensurePaperStyle() {
      if (classic.styleEl && classic.styleEl.parentNode) return classic.styleEl;
      var el = document.createElement('style');
      el.id = 'wenyan-paper';
      el.textContent = PAPER_CSS;
      document.head.appendChild(el);
      classic.styleEl = el;
      return el;
    }

    function setPaper(on) {
      if (on === classic.paperOn && classic.styleEl) return;
      classic.paperOn = on;
      if (on) {
        ensurePaperStyle();
        document.documentElement.classList.add('wy-paper');
      } else {
        document.documentElement.classList.remove('wy-paper');
        if (classic.styleEl && classic.styleEl.parentNode) classic.styleEl.parentNode.removeChild(classic.styleEl);
        classic.styleEl = null;
      }
    }

    var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, CODE: 1, PRE: 1, KBD: 1, SAMP: 1, TEXTAREA: 1, INPUT: 1, OPTION: 1, SVG: 1 };

    /** 这个文本节点能不能动？太长的不动、带标点的不动、在代码里的不动。 */
    function eligible(node) {
      var raw = node.nodeValue;
      if (!raw) return null;
      var text = raw.trim();
      if (!text || text.length > 12) return null;
      if (/[。，、；：？！.,;:!?「」“”]/.test(text)) return null;
      if (!WORDS[text]) return null;
      var el = node.parentElement;
      if (!el) return null;
      if (SKIP_TAGS[el.tagName]) return null;
      if (el.isContentEditable) return null;
      if (el.closest && el.closest('pre, code, kbd, samp, textarea, input, [contenteditable="true"], [data-wy-skip]')) return null;
      return text;
    }

    function translateNode(node) {
      var key = eligible(node);
      if (!key) return false;
      if (!classic.saved) classic.saved = new Map();
      if (!classic.saved.has(node)) classic.saved.set(node, node.nodeValue);
      var lead = node.nodeValue.slice(0, node.nodeValue.indexOf(key));
      var tail = node.nodeValue.slice(node.nodeValue.indexOf(key) + key.length);
      node.nodeValue = lead + WORDS[key] + tail;
      return true;
    }

    function translateTree(root) {
      if (!root) return;
      if (root.nodeType === 3) { translateNode(root); return; }
      if (root.nodeType !== 1 && root.nodeType !== 11) return;
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      var batch = [];
      var n;
      while ((n = walker.nextNode())) batch.push(n);
      for (var i = 0; i < batch.length; i++) translateNode(batch[i]);
    }

    function setWords(on) {
      if (on === classic.wordsOn) return;
      classic.wordsOn = on;
      if (on) {
        if (!classic.saved) classic.saved = new Map();
        translateTree(document.body);
        // React 会不断插入新节点：看着点，插进来的也翻。
        classic.observer = new MutationObserver(function (records) {
          if (classic.busy) return;
          classic.busy = true;
          try {
            for (var i = 0; i < records.length; i++) {
              var r = records[i];
              if (r.type === 'characterData') { translateNode(r.target); continue; }
              for (var j = 0; j < r.addedNodes.length; j++) translateTree(r.addedNodes[j]);
            }
          } finally {
            classic.busy = false;
          }
        });
        classic.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      } else {
        if (classic.observer) { classic.observer.disconnect(); classic.observer = null; }
        if (classic.saved) {
          classic.busy = true;
          classic.saved.forEach(function (original, node) {
            if (node && node.nodeValue !== original) node.nodeValue = original;
          });
          classic.busy = false;
          classic.saved = new Map();
        }
      }
    }

    /** 状态一变就同步一次外观；开关关掉时把界面原样还回去。 */
    function syncClassic() {
      var st = (store.snap && store.snap.state) || null;
      var on = !!(st && st.on === true);
      try { setPaper(on && st.paper !== false); } catch (e) { /* ignore */ }
      try { setWords(on && st.ui !== false); } catch (e) { /* ignore */ }
    }

    // 开的时候把右侧栏那页顶出来 —— 「开了就有地方关」是这条需求的一半。
    var services = {};    function reveal() {
      try {
        if (services.layout && typeof services.layout.openRightbar === 'function') {
          services.layout.openRightbar(true, false);
        }
      } catch (e) { /* ignore */ }
      try {
        if (services.sidebarRight && typeof services.sidebarRight.openTab === 'function') {
          services.sidebarRight.openTab(TAB_KIND);
        }
      } catch (e) { /* ignore */ }
    }
    function hide() {
      try {
        if (services.layout && typeof services.layout.closeRightbar === 'function') {
          services.layout.closeRightbar();
        }
      } catch (e) { /* ignore */ }
    }

    // ------------------------------------------------------------------ 角落
    function Corner() {
      var st = useStore();
      var snap = st.snap;
      var on = !!(snap && snap.state && snap.state.on);
      var title = snap
        ? (on ? '文言模式：开（' + snap.state.style + '）—— 点一下关' : '文言模式：关 —— 点一下开')
        : '文言模式';
      return h('div', { style: { position: 'fixed', top: 4, right: 150, zIndex: 70, pointerEvents: 'auto' } },
        h('div', {
          style: Object.assign({}, S.chip, on ? S.chipOn : null, st.busy ? { opacity: .6 } : null),
          title: title,
          onClick: function (e) {
            e.stopPropagation();
            if (st.busy) return;
            var next = !on;
            set({ on: next }).then(function () {
              if (next) reveal();
              else load(true);
            }).catch(function () { /* store.error 已经写了 */ });
          },
        }, '文'));
    }

    // ------------------------------------------------------------------ 面板
    function StyleChip(props) {
      return h('button', {
        style: Object.assign({}, S.styleChip, props.on ? S.styleChipOn : null),
        disabled: props.disabled,
        onClick: props.onClick,
      }, props.label);
    }

    function Panel() {
      var st = useStore();
      var snap = st.snap;
      var state = (snap && snap.state) || { on: false, style: 'ya', gloss: false, paper: true, ui: true };
      var styles = (snap && snap.styles) || [];
      var on = state.on === true;
      var active = styles.filter(function (s) { return s.id === state.style; })[0] || styles[0] || null;
      var flashVar = React.useState('');
      var flash = flashVar[0];
      var setFlash = flashVar[1];
      function say(msg) { setFlash(msg); setTimeout(function () { setFlash(''); }, 1800); }
      /** 一个带勾的开关行；gloss / 纸色 / 界面文言 三处共用。 */
      function cbRow(label, checked, onClick) {
        return h('div', { style: S.cbRow, onClick: function () { if (st.busy) return; onClick(); } },
          h('div', { style: Object.assign({}, S.box, checked ? S.boxOn : null) }, checked ? '✓' : ''),
          h('span', null, label),
        );
      }

      return h('div', { style: S.root },
        h('div', { style: S.head },
          h('span', { style: S.title }, t('title')),
          h('span', { style: S.stateWord }, on ? t('on') : t('off')),
          h('span', { style: { flex: 1 } }),
          h('button', { style: S.btn, onClick: function () { load(true); } }, '⟳'),
        ),
        h('div', { style: S.body },
          st.error ? h('div', { style: S.err }, t('failed') + '：' + st.error) : null,

          h('div', { style: S.card },
            h('div', { style: S.row },
              h('div', { style: Object.assign({}, S.grow) },
                h('div', { style: { fontSize: 12.5, fontWeight: 600 } }, on ? '文言已开' : '文言已关'),
                h('div', { style: { fontSize: 11, color: LABEL3, marginTop: 3 } },
                  on && active ? active.label + ' · ' + active.tagline : '回答与思考照常白话'),
              ),
              h('div', {
                style: Object.assign({}, S.bigSwitch, on ? S.bigSwitchOn : null, st.busy ? { opacity: .6 } : null),
                onClick: function () {
                  if (st.busy) return;
                  set({ on: !on }).then(function () {
                    say(t('justNow'));
                    if (!on) reveal();
                  }).catch(function () { /* 已写进 store.error */ });
                },
              },
                h('div', { style: Object.assign({}, S.knob, on ? S.knobOn : null) }),
              ),
            ),
            h('div', { style: S.hint }, on ? t('hintOn') : t('hintOff')),
          ),

          h('div', { style: S.card },
            h('div', { style: { fontSize: 11, color: LABEL3, marginBottom: 7 } }, t('style')),
            h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
              styles.map(function (s) {
                return h(StyleChip, {
                  key: s.id,
                  label: s.label,
                  on: s.id === state.style,
                  disabled: st.busy,
                  onClick: function () {
                    if (st.busy || s.id === state.style) return;
                    set({ style: s.id }).then(function () { say(t('justNow')); }).catch(function () {});
                  },
                });
              })),
            active ? h('div', { style: S.tagline }, active.label + ' · ' + active.tagline) : null,
            active && active.demo ? h('div', { style: S.demoBox },
              h('div', { style: S.demoPlain }, active.demo.plain),
              h('div', { style: S.demoText }, active.demo.text),
            ) : null,
          ),

          h('div', { style: S.card },
            h('div', {
              style: S.cbRow,
              onClick: function () {
                if (st.busy) return;
                set({ gloss: !state.gloss }).then(function () { say(t('justNow')); }).catch(function () {});
              },
            },
              h('div', { style: Object.assign({}, S.box, state.gloss ? S.boxOn : null) }, state.gloss ? '✓' : ''),
              h('span', null, t('gloss')),
            ),
            flash ? h('div', { style: S.flash }, flash) : null,
          ),

          // 开的时候界面长什么样：纸色、界面文言，两个勾各自能关。
          h('div', { style: S.sect }, t('look')),
          h('div', { style: S.card },
            cbRow(t('paper'), state.paper !== false, function () {
              set({ paper: state.paper === false }).catch(function () {});
            }),
            cbRow(t('uiWords'), state.ui !== false, function () {
              set({ ui: state.ui === false }).catch(function () {});
            }),
          ),

          h('div', { style: S.row },
            // 只有开着的时候「关掉并收起」才有意义；关着的时候画它是纯噪音。
            on ? h('button', {
              style: Object.assign({}, S.btn, S.btnDanger),
              onClick: function () {
                if (st.busy) return;
                set({ on: false }).then(function () { hide(); }).catch(function () {});
              },
            }, t('close')) : null,
            h('span', { style: { flex: 1 } }),
            h('span', { style: { fontSize: 10.5, color: LABEL3 } }, snap ? snap.build : ''),
          ),

          snap ? h('div', { style: S.foot }, t('file') + '：' + (snap.file || '—')) : null,
          !snap && !st.error ? h('div', { style: S.foot }, t('loading')) : null,
        ),
      );
    }

    // ------------------------------------------------------------------ apply
    var inject = ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'layout'];

    function apply(ctx) {
      services.layout = ctx.layout;
      services.sidebarRight = ctx.sidebarRight;

      try {
        ctx.effect(function () { return ctx.locale.register(NS, { zh: zh, en: en }); }, 'wenyan: dictionaries');
      } catch (e) { /* locale 可选 */ }

      try {
        ctx.effect(function () {
          return ctx.sidebarRightTabs.register({
            id: TAB_ID,
            kind: TAB_KIND,
            priority: 'extension',
            title: function () { return t('tab'); },
            guide: [{
              id: 'wenyan',
              order: 60,
              title: function () { return t('tab'); },
              description: function () { return t('guide'); },
            }],
          });
        }, 'wenyan: sidebar page type');
      } catch (e) { /* 没有 sidebarRightTabs 就只剩角落那个开关 */ }

      try {
        ctx.effect(function () {
          return ctx.slots.inject('sidebar.right.pane.tab', function () {
            return ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID, locale: NS }, Panel);
          });
        }, 'wenyan: sidebar page body');
      } catch (e) { /* ignore */ }

      try {
        ctx.effect(function () {
          return ctx.slots.inject('shell.overlay', function () {
            return ctx.slots.register({ name: 'shell.overlay', id: 'wenyan-corner', order: 55 }, Corner);
          });
        }, 'wenyan: corner glyph');
      } catch (e) { /* ignore */ }

      // 起来先读一次：开着的话，角落已经是墨色，不用等轮询。
      // 外观（纸色 / 界面文言）跟着状态走：状态一变就同步一次。
      subscribe(syncClassic);
      load(true).then(syncClassic, function () { /* 读不到就先不动界面 */ });
    }

    exports.apply = apply;
    exports.inject = inject;
    exports.__internals = { Corner: Corner, Panel: Panel, store: store, api: api, set: set, load: load, t: t };
    return module.exports;
  },
});
