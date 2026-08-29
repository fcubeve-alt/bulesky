# HANDOVER

给接手的人。写于 2026-08-28,分支 `claude/privacy-official-blog-qa490n`。

这份文件只有两件事:**一个没解决的问题**,和**这一段时间做了什么、还剩什么**。
先读第 1 节。它是唯一还在流血的地方,前面已经改了十次没成。

---

## 1. ⚠️ 未解决:iPhone 主屏幕 App 底部的黑边

### 1.1 现象

把 cubewithin.com「添加到主屏幕」,从图标全屏打开,**屏幕底部有一条纯色横带**,不是天空。
最近几次的实测(从用户截图里逐像素量出来的):

| 时间 | 黑边高度 | 颜色 | 对应的代码状态 |
|---|---|---|---|
| 第 1 次 | ~35pt | **白色** | `html` 没有背景色 |
| 第 2 次 | 62pt(在**顶部**) | `#05060f` | `top:0` + `height:100vh` |
| 第 3 次 | 64pt | `#05060f` | 同上(手机上是旧缓存) |
| 第 4 次 | 69pt | `#05060f` | 同上(仍是旧缓存) |
| 第 5 次 | **274pt** | `#05060f` | `top/bottom:-120` + `height:auto` ← 我改坏的 |

最后一次(`ca3b2c0`,已部署)**用户还没验证**。不要假设它好了,也不要假设它没好。

### 1.2 已经量到的硬数据(来自 `/diag.html`,iPhone 16 Pro,402×874pt)

这三个数字是整件事的核心,**它们互不相等**:

```
position:fixed 图层实际所在的盒子   684px
100vh                             792px
screen.height                     874px   ← 真实屏幕
```

**所以任何用 `100vh` 或 `inset:0` 去算高度的写法都必然差一截。** 这一条已经被实测钉死,不要再试。

### 1.3 已经排除的原因(别再走一遍)

- **不是** `html` 没背景色 —— 早就加了(`#05060f`)。黑边正是这个颜色。
- **不是** 安全区(safe-area)不够 —— 最大 62pt,而已经留了 120px 余量。
- **不是** `apple-mobile-web-app-status-bar-style` 配错 —— 顶部已经能铺满,状态栏是透明的。
- **不是** R2 / 后端 / 部署失败 —— 每次部署都绿,而且现在部署完会去问线上探针。

### 1.4 两个已经确认的真实原因(都已修,但组合效果未验证)

**(a) 缓存 —— 修的代码根本没到手机上。**
第 2~4 次的黑边像素颜色和高度,精确对应 commit `8f53569` 那一版的几何。也就是说手机上跑的是好几版之前的 `/css/style.css`,而 `?v=` 改了也没用。
→ 现在的对策:`/diag.html`(见 §1.6)、`index.html` 里的 build stamp、`app.js` 里的自愈。

**(b) `<video>` 是替换元素(replaced element)。**
我一度改成 `top:-120px; bottom:-120px; height:auto`,理由是"用偏移就不用知道高度"。
**这对 `<div>` 成立,对 `<video>` 不成立**:替换元素的 `height:auto` 会取固有高度,`bottom` 被直接忽略。浏览器里实测:
```
#sky-bg  h=1020px      ← div,对
.bg-video h=150px      ← video,错
```
到手机上就是画面停在 600pt / 874pt,底下 274pt 全黑。
→ **`.bg-video` 永远不能用 `height:auto` 或依赖 `bottom`。**

### 1.5 当前的写法(`public/index.html` 的内联 `<style>`)

规则**故意写在 `index.html` 里**,不在 `style.css` 里 —— 因为 `style.css` 有自己的 URL,会单独变旧;`index.html` 每次都会重新取。

```css
#sky-bg, .bg-video, #bg-scrim, #lanterns, .overlay {
  position: fixed;
  top: calc(0px - var(--bleed, 120px));
  left: 0;
  width: 100vw;
  height: calc(var(--sky-h, 200vh) + var(--bleed, 120px) * 2);
  bottom: auto;               /* ⚠️ 见 §1.4(b),不要改成负值 */
}
```
`--sky-h` 由 `index.html` 里首屏绘制前的内联脚本写入 = `max(screen.height, innerHeight, clientHeight)`,`app.js` 的 `keepSkyHeight()` 在旋转时重写。

保险:`#sky-bg`(夜空渐变)**不再在播视频时隐藏**,垫在视频后面。万一还有哪层没铺满,露出来的是夜空而不是死黑。

### 1.6 下一步怎么查(不要靠猜,前十次都是猜错的)

**让用户打开 `https://cubewithin.com/diag.html`,截整页发过来。** 这个页面没有外部 CSS/JS、没有缓存历史,专门为"别的页面都变旧了"的场景做的。它会直接说:

- 顶部一行:**STALE**(手机上是旧版)还是 **UP TO DATE**
- `screen.height` / `100vh` / fixed 盒子高度 三个数
- 用当前规则**分别建一个 `<div>` 和一个 `<video>`**,报各自的 top..bottom
  → **两者不一致 = §1.4(b) 那个坑又回来了**
- 底部一个 **FORCE UPDATE AND RELOAD** 按钮:注销 Service Worker、清所有缓存、跳到缓存没见过的 URL 重载。**用户不必删图标重加。**

**另外**:用户的截图可以逐像素量。做法在这个 session 里用了五次,每次都定位准确 —— 用 Python 解 PNG,从底边往上扫第一处颜色跳变,算出黑边高度(px÷3=pt)和 RGB。颜色能反推出手机上跑的是哪一版代码。

### 1.7 如果还是不行

**用户已经明确表达了不满,并提出过退回。** 优先考虑:
```
把 §1.5 那条规则连同相关改动退回到 8f53569 之前
```
那是"上面一横、下面通透"的状态 —— 不完美,但用户熟悉且稳定。**不要在用户没同意的情况下继续叠新方案。**

---

## 2. 这一段做了什么(15 个 commit,全部已推送并部署)

### 2.1 悄悄话 / 身份

- **`7125f54`** 发布后作者立刻能看到自己写的字(阅读视图直接打开在新发的那条),不用在气球堆里找;名字不用贴恢复码就能从服务器取回(`/api/me` 现在返回 name)。
- **`99f3687`** 第二条起不再弹确认框(危机词命中的除外);后台「Numbers」把"用户数"改成 **Writing identities**,并写明这是**人数上限而非人数** —— 一台手机上不同浏览器/无痕窗口各算一个,这是 localStorage 的边界,**除了指纹识别没有办法解决,而指纹识别这个项目不做**。
- 发布框在没有名字的浏览器上会提示"在别的浏览器上写过?贴回恢复码",一键跳到粘贴框。

### 2.2 音频

- **`954bff8`** `docs/CURRENT_AUDIO_ARCHITECTURE.md` —— 现有音频系统的完整审计。**接手前必读**,里面有和 Hybrid TTS 方案冲突的四个点。
- **`b81968c`** R2 桶已绑定并**验证在用**(线上探针 `live store = r2`)。音频从 D1 搬到 R2,每 GB 便宜 50 倍,且出站流量免费。
- **`a760102`** 部署完会去问线上 `?probe=1`,把真实的 store 打进日志 —— 因为 `wrangler pages deploy` **不打印绑定表**,"部署成功"根本不能证明绑定生效。
- **`bec116b`** `tools/revoice.mjs` —— 在用户的 Windows 上跑,调本机 VoiceStudio 用品牌声音重念,EQ+去齿音,转 AAC,写到本地文件夹试听。**不上传、不碰线上**。已用假 VoiceStudio 端到端验证(字段逐项核对过)。

### 2.3 App / PWA

- **`9673a32`** `docs/APP_STORE.md` §7b:不用开发者账号就能测的两条路。安卓 debug APK 已成功构建过(Actions → App — build Android → Artifacts)。
- **`f59b96e`** 主屏幕图标名字从 "Starry Mind" 改成 "Are you alright?"。
- **`b32e436`** `/diag.html` + build stamp + 自愈 + `tools/staleness-test.mjs`。

### 2.4 其它

- **`76c00f8`** About 页加了 GetSongBPM 归属链接(`index,follow` 的页面,**故意没加 `rel="nofollow"`**,加了就不算数)。

---

## 3. 还剩什么

> **2026-08-29 更新(分支 `claude/wonderful-feynman-41t21o`)。**
> 第 1 节那条黑边和 3.1 那两个待决定项都有结论了,见文末第 6 节。

### 3.1 需要用户决定(问了但还没答复)

1. **音频归属方案**:复用现有的「按文本 hash 存」(不用改数据库/端点/前端,Worker 只需要一个桶的写权限),还是按文档加 `permanent_audio_url` 字段(要迁移+状态机+Worker 要写生产数据库)。**建议前者**,理由在 `CURRENT_AUDIO_ARCHITECTURE.md` §6a。
2. **是否给全部气球生成永久音频**,还是只给"至少被听过一次"的。R2 上成本差别很小(10 万条约 $0.09/月),但会打破 CLAUDE.md 的"发布不生成"。

### 3.2 需要用户提供

3. **VoiceStudio 的 ffmpeg EQ/去齿音链** —— `tools/revoice.mjs` 里现在那串是猜的。**它是声音配方的一部分**,批量生成后再改,音频库里会同时存在两种听感且分不出来。
4. **Apple 开发者账号($99/年)** —— 上架 iOS 唯一的真堵点。
5. Cloudflare API Token 加 **R2 读权限**(可选)—— 部署里那个"核对桶名"的检查现在因权限不足跑不了,只是少一层保险。

### 3.3 已知漏洞,该修但还没修

6. **⚠️ 音频比悄悄话活得久。** `src/retention.js` 一年后删气球、回复、举报、收藏,**唯独不删音频**;作者自己删除也一样(只设 `hidden=1`,播放被挡住但字节还在)。
   - 成本:一年后没有任何东西会再引用那份音频,纯占地方,存储**无限增长**而不是"最多一年的量"。
   - 更重要:和 Hybrid TTS 文档 §13、和站上的隐私承诺**直接冲突**。
   - 这条**和 VoiceStudio 无关,现在就是漏的**。

---

## 4. 动手之前必读

- `CLAUDE.md` —— 尤其是"朗读 / Listen"那一段的几条硬规则:**一条朗读只能有一个人在读**、**这个 endpoint 永不返回 5xx**、**从点击到出声之间不能有 `await`**。
- `docs/SKY_FEED.md` —— 天空的所有规则。§7c 是这次黑边的完整记录。
- `docs/CURRENT_AUDIO_ARCHITECTURE.md` —— 音频现状 + 与新方案的冲突点。
- `docs/ROADMAP.md` §7d/§7e/§7f。

## 5. 怎么跑测试

```bash
ln -sfn /opt/node22/lib/node_modules node_modules      # 容器里需要
python3 -m http.server 8788 --directory public &
node tools/check-css.mjs
node tools/sky-feedback-test.mjs      # 天空、满屏图层、黑边的回归
node tools/staleness-test.mjs         # build stamp + 自愈
node tools/identity-test.mjs
node tools/restore-test.mjs
node tools/listen-test.mjs
# App 壳:
node app/sync-www.mjs && python3 -m http.server 8790 --directory app/www &
node tools/app-shell-test.mjs
```

部署:Actions → **Deploy to Cloudflare** → Run workflow(分支 `claude/privacy-official-blog-qa490n`)。
`push` 触发只认 `claude/lingxingkong-prd-t1x2mg`,所以现在都是手动 dispatch。

---

## 6. 2026-08-29:黑边定位到了,音色回填的链路建好了

Owner 的原话:「app的页面要是手机的全部屏幕,不要有黑边;把现在所有气球的音频重新生成,
用我们自己的已调好的音色。其他的细节不要问我,你自己判断。」

### 6a. 黑边:**不在网页里,在原生窗口里**

第 1 节整节都在查 CSS。**网页那一半其实早就对了** —— `tools/sky-feedback-test.mjs` 里
"每一层都溢出屏幕两端"的断言一直是绿的,在无头浏览器里按真实手机尺寸量过 28 项。

错的是**网页被放进去的那个原生窗口**,而且 Capacitor 的脚手架两个平台各错一处:

- **iOS**:`contentInset: "always"` —— WKWebView 按安全区把内容内缩,上下各留一条窗口底色。
  改成 `"never"`。
- **Android**:主题不透明 + `decorFitsSystemWindows` 默认为真 —— WebView 被夹在状态栏和
  导航栏**之间**。要**三条同时成立**才行(透明栏色 / `setDecorFitsSystemWindows(false)` /
  `shortEdges`),少一条边就回来。

外加一条:能在 WebView 之前或背后露出来的面有四个(`<html>` 画布、两个原生窗口底色、启动图),
**任何一个和别人不一样,那个不一样本身就是一条可见的边**。现在四个都是 `#05060f`。

完整记录在 `docs/APP_SHELL.md` 末尾那节。断言在 `tools/app-fullscreen-test.mjs`,不需要
设备就能跑。Android 侧已经在 Actions 上真编译通过。

> ⚠️ 这**不推翻**第 1 节。那一节讲的是"添加到主屏幕"的 PWA,里面关于缓存和
> `<video>` 是替换元素的两条结论仍然成立,`/diag.html` 仍然是查 PWA 那条路的工具。
> 这一节讲的是 **App**,是另一条路。

### 6b. 音色:能建的都建好并验过了,**生成本身我做不了**

VoiceStudio 在 `127.0.0.1:3900`,是 Owner 那台 Windows 的地址,云端容器没有路由能到 ——
网络拓扑,不是权限。所以**声音只能在那台机器上生成**。

做的是把生成之外的每一环建好、用假 VoiceStudio 端到端验过,让那边只剩一条命令:

```bash
node tools/revoice.mjs --all --upload
```

设计和取舍写在 `docs/CURRENT_AUDIO_ARCHITECTURE.md` §9,顺带把该文档 §6 那四个冲突点
(§6a 字段、§6b 打破懒生成、§6c 写生产的通道、§6d 配方进 hash)全部结掉了。
**3.2 第 3 条那串 EQ 链现在可以安全替换** —— 配方变了会自动重读,不可能出现半个库一种听感。

要 Owner 做的只有一件:`wrangler pages secret put VOICE_UPLOAD_TOKEN`。

### 6c. 没做的

3.3 第 6 条(**音频比悄悄话活得久**,`src/retention.js` 一年后不删音频)**还没修**。
它和这次两件事都无关,但它现在就是漏的,而且和站上的隐私承诺直接冲突。
`src/voice-store.js` 里 `deleteVoice()` 已经写好了,缺的是调用它的地方 ——
现在还多了一份品牌音频要一起删。

---

## 7. 2026-08-29 晚:黑边量出来了 —— 是缓存,而且自愈代码有个死锁

Owner 发来一张主屏幕 App 的截图,逐像素量了:

```
截图        1206 × 2622 px @3x  =  402 × 874 pt   → iPhone 16 Pro
黑边        y 2436–2621  =  186px  =  62.0 pt(底部)
颜色        (5, 6, 15) 精确 = #05060f  = html 的画布色
内容止于    812 pt,屏幕 874 pt,差 62 pt
```

**62pt + `#05060f` 精确对应第 1 节那张表的「第 2 次」**,而那一栏自己写着"手机上是旧缓存"。
也就是说:**从 8f53569 之后的每一版都没有到过那部手机。**

### 7a. 死锁在哪

`healIfStale()` 第三行:

```js
const mine = meta && meta.content;
if (!mine) return;   // ← 这一行
```

build stamp 是 `b32e436` 才加的。手机上那份页面**比它还老,根本没有 stamp**,于是自愈
**在唯一需要它的那部手机上直接 return**。页面自己救不了自己 —— 救援代码在那个页面里。

### 7b. 怎么砸开的

**Service Worker 是浏览器唯一保证会自己去重取的文件**(导航时检查、至少每天一次、且绕过
HTTP 缓存)。所以不管别的被钉成什么样,**新的 `sw.js` 一定会到**。现在它:

- `activate` 时删掉所有旧缓存;
- **只有当真的删掉了旧版本缓存时**,才把还在显示旧页面的窗口 `client.navigate()` 到一个带
  `?fresh=` 的地址。已经是最新的手机不会被打扰 —— 别把这条改成无条件,那等于每次部署都
  把所有人(包括正在写悄悄话的人)刷一遍;
- 导航请求一律 `cache: 'reload'`(**直接绕过**),不再是 `no-cache`(只是"去问一下服务器",
  而装在主屏幕上的 iOS web app **可以不问**)。这个区别就是那四天。

外加 `public/_headers`:`/`、`/index.html`、`/diag.html`、`/sw.js` 一律 `no-cache`。

`healIfStale()` 里那行也改了:**没有 stamp = 已知最老的页面**,是最强的过期证据,不是放弃的理由。

### 7c. 同时:天空不再靠"算"了

`keepSkyHeight()` 改成闭环。老办法是算一个高度→部署→等照片,十一轮都是这个形状。
现在它设完 `--sky-h` 之后**真的去量**每一层背景的 `getBoundingClientRect()`,短多少补多少。
它不需要知道为什么短,它看得见短了。只增不减,只动背景层(**不动 `#lanterns`** —— 气球世界
在它里面,改高度会让全天空的气球位移)。量到的东西写进 localStorage,`/diag.html` 会打印,
**包括"是不是从主屏幕打开的"** —— 第 1 节那三个数(684/792/874)很可能是在 Safari 里量的,
和主屏幕 App 不是一回事。

回归测试:把一个 `<video>` 打断成当年真实坏掉的样子(自身固有高度),要求页面**不经过部署**
自己把它补回来。

### 7d. 如果这次还不行

`/diag.html` 现在多了一段 "What the app measured",直接列出每一层画到哪儿、差多少、
以及是不是 standalone。**拿那一段的截图**,不要再拿主页截图 —— 主页截图只能告诉我"还有边",
那一段能告诉我是哪一层、短多少。
