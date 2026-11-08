# dsh-wenyan · 文言模式

> 一个开关，默认关。打开之后，DSH 的**回答与思考链**改用文言写；代码、命令、路径、JSON、报错原文一字不易。
> 右上角一个「文」字角、右侧栏一页，随时都能关掉。

---

## 它到底改了什么

**不替换界面文字，不改历史消息，只改下一回合起生成的文字。**

做了三件小事，都在正确的位置上：

1. 插件往系统提示里挂了一段上下文（`systemPrompt.context`），每回合装配提示时才读一次开关状态。
   关着的时候那段的 `text` 是空字符串 —— 等于没有注入，token 一个都不多花。
2. 开着的时候注入一段「规矩 + 风格 + 示例」。**模型自己用文言写**，而不是把白话做字符串替换。
   词表替换只能得到半文半白（「的」→「之」），读起来比白话更难受。
3. 已经印在屏幕上的旧句子不回改 —— 提示只影响之后的生成，天然满足「只换新的」。

三个档（`lib/prompt.js` 的 `STYLES`）：

| id | 名字 | 味道 | 示范 |
| --- | --- | --- | --- |
| `ya` | 雅正 | 浅近文言，近《世说新语》与明清尺牍 | 此策可行。然须先试其一端，验之后定。 |
| `jian` | 简古 | 近《论语》《老子》，去今语助词 | 可。先试一端，验之。 |
| `pian` | 骈俪 | 四六成句，铺陈有节，技术细节仍须点明 | 策既可采，事犹当试；先验一端，后及全体。 |

规矩里有六条硬约定（`PREAMBLE`），其中两条是关键：

- **代码、命令、路径、JSON、日志、报错原文一字不易。** 否则它会把 `npm run dev` 也翻了。
- **宁可文浅，不可失实。** 说不清的就说白话，不许为了好看编。

另有可选第七条：勾上「每段末附一句白话」，每段末尾补一句白话解释，方便回读。

## 界面

| 位置 | 是什么 | 怎么用 |
| --- | --- | --- |
| 窗口右上角「文」角 | 一个 26×22 的小角标。关=描边、开=墨底白字 | 点一下开/关；开着的时候右侧栏那页会被顶出来 |
| 右侧栏「文言」页 | 大开关、三档风格、示范对照、「附白话」勾选、「关掉并收起」 | 想改档就在这改，改完下一回合生效 |

「关掉并收起」= 关开关 + 收起右侧栏，一步回到干净界面。

## 装

```bash
# A. 从 npm 装（推荐，插件市场里也是这个）
dsh plugin --profile web add dsh-wenyan

# B. 直接从 GitHub 装
dsh plugin --profile web add github:silversystem04-coder/dsh-wenyan

# C. 从本地源码装
powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

脚本做三件事：复制到 `<profile>\plugins\dsh-wenyan` 与 `<profile>\node_modules\dsh-wenyan`（Node 按 realpath 缓存模块，所以整目录覆盖），
再往 `cordis.patch.yml` **按字节追加**一段 `insert`（不重写全文，避免二次编码把 YAML 弄坏）。

装完 **刷新页面（Ctrl+R）**：新的 client bundle 才会进启动图。
**改了 `index.js`（host 半边）还要再重启一次 DSH** —— host 只在进程启动时加载。

卸载：删掉 `cordis.patch.yml` 里那段 `# --- wenyan` 注释到 `order: 88` 的 insert 块，刷新页面。

## 配置

```yaml
- insert:
    - id: wenyan
      name: 'dsh-wenyan'
      config:
        order: 88        # 注入段在系统提示里的排序位，默认 88
```

状态不存在 profile 里，存在 `~/.dsh/storages/wenyan/state.json`：

```json
{ "version": 1, "on": false, "style": "ya", "gloss": false, "updatedAt": "2026-11-08T04:27:42.717Z" }
```

写盘是「先 .tmp、旧文件 copy 成 .bak、再 rename」，坏文件读出来只是 `ok:false`，不会把状态弄丢。

## 接口

只对回环地址、只接受同源页面，GET 只读、POST 要带头。前缀 `/wenyan`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/wenyan/api/ping` | `{ok, build, line}`，`line` 是「文言模式：开 · 骈俪 · 附白话」这种人话 |
| GET | `/wenyan/api/state` | 当前状态 + 三档元数据（label/tagline/sample/demo）+ 状态文件路径 |
| POST | `/wenyan/api/set` | `{on?:bool, style?:'ya'\|'jian'\|'pian', gloss?:bool}`，返回新状态 |

POST 的三道门：`isLoopback` + 同源（`sec-fetch-site` 不是 `cross-site`）+ 头 `x-wenyan: 1`；
另外 `content-type` 必须是 JSON、body 上限 32KB、未知风格 400、空 patch 400。

## 自检

```bash
node test.mjs                 # 63 项：状态层 / 提示层 / 接口层
node test/render-smoke.mjs    # 21 项：假 React 走一遍组件树，抓 undefined / NaN / [object Object]
node test/visual.mjs          # 出 test/visual.html（真数据）
```

出图（Edge 无头，必须给独立 user-data-dir，否则会和已开的浏览器打架）：

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 `
  --user-data-dir="$env:TEMP\wenyan-shot" --window-size=820,800 --virtual-time-budget=4000 `
  --screenshot="preview-off.png" "file:///<repo>/test/visual.html"
```

想画「开着」的样子：先造一份 state.json，再 `node test/visual.mjs <state.json> test/visual-on.html`。

## 边界（先说清楚，免得当成 bug）

- **只影响之后的生成。** 打开之前已经写出来的回答不会被改写 —— 这是设计，不是没生效。
- **思考链也是模型写的**，所以同样受提示约束；但有些模型会把 reasoning 压得很短，文言效果不如正文明显。
- 提示是「软约束」：模型偶尔会漏一两句白话，尤其是夹了大量代码的时候。规矩里留了「说人话」这个豁口，就是为了你随时能喊停。
- 状态是全局的，不按会话分。要按会话分得再存一层会话 id。
- 不碰界面文案（按钮、菜单还是白话）—— 那是另一件事，做了也未必好看。

## 文件

```
index.js            host 半边：注入系统提示、路由、wenyan_mode 工具
lib/state.js        状态读写（原子写 + .bak + 坏文件容错）
lib/prompt.js       三档风格 + 七条规矩 + 拼装
lib/client.js       client 半边：右上角「文」角 + 右侧栏一页（手写 bundle，无构建）
install.ps1         装机（纯 ASCII）
test.mjs            自检 63 项
test/render-smoke.mjs   渲染冒烟 21 项
test/visual.mjs     出预览图
```

MIT.
