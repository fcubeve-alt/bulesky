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

### 7d. ⚠️ 7a/7b 的诊断是错的 —— 不是缓存

Owner 换了一台**全新的、没用过的手机**,从浏览器重新添加到主屏幕,**一模一样的 62pt 黑边**。
所以第 7a 节那个"自愈死锁"是真的、值得修,但**它不是这条黑边的原因**。
又一次靠一张截图往下推,又一次推错 —— 和第 1 节记的前十轮是同一个坑。

### 7e. 真正的原因,和这次为什么不一样

那张截图里有一条被忽略的证据:**云一直画到屏幕最顶上,盖在时间和信号底下。**
说明 iOS 给了页面**整块屏幕**,顶部没有被切。那么底下那 62pt **就在页面画得到的范围之内** ——
不是够不着,**是那几层背景自己算矮了**。

盒子底边落在 812pt = `--sky-h + 120`,反推 **`--sky-h ≈ 692`**。而 `--sky-h` 就是
`Math.max(screen.height, innerHeight, clientHeight)`。**也就是说 `screen.height` 在这台手机上
不是 874。** 第 1 节量到的三个数(684 / 792 / 874)本来就已经在说这件事了,
而前十一轮做的全都是"在这三个数里挑一个正确的"。

**所以现在这条规则里一个数都没有:**

```css
#sky-bg, .bg-video, #bg-scrim {
  position: fixed;
  inset: 0;              /* 盒子就是视口本身,不是对视口的测量 */
  width: 100%; height: 100%;
  transform: scale(1.2); /* 然后放大两成,四边各溢出约一成 */
}
```

- **不问 `screen.height`,不用 `vh`,不碰 JS。** 它不可能把屏幕的大小搞错,因为它从来不问。
- **用 transform 而不是负偏移**:`<video>` 是替换元素,`bottom` 被忽略、`height:auto` 取固有
  高度(§1.4b)。**transform 在布局之后作用于渲染盒,对 `<div>` 和 `<video>` 完全一致** ——
  这是选它的全部理由。
- 代价是背景被裁掉一成。夜空背后的风景,没人看得出来;底下一条边,人人看得出来。
- **`#lanterns` / `.overlay` 绝对不能加进这条规则** —— 气球世界在 `#lanterns` 里面,
  缩放它会让全天空的气球位移和变形(`docs/SKY_FEED.md`)。它们留在旧规则上。

回归测试也跟着改了:不再去加 computed 的 `top + height`(那是在验一条规则的算术),
改成量 `getBoundingClientRect()` —— **transform 的结果只有它报得出来**,而且那才是诚实的问题:
照片拍到的是画出来的像素,黑边就是画出来的像素。

### 7f. ⚠️ 7e 也不对 —— 黑边根本不在盒子上,在**视频画面里**

7e 那版(`inset:0` + `scale(1.2)`)部署后,Owner 发来两张相隔两分钟的截图。逐像素量:

| 时间 | 背景 | 视频画面 | 缺口 |
|---|---|---|---|
| 2:18 | 湖 | 0 → 812pt | **底部** 62pt |
| 2:20 | 夜路 | 25.7 → 874pt | **顶部** 25.7pt |

缺口的颜色是**精确的 `(5,6,15)`**,一个像素不差 —— 那是 `#05060f`,画布色,**不是视频里的黑**。

两条结论,都是决定性的:

1. **缺口一次在下、一次在上。** letterbox 是对称的,偏移才不对称。
2. **画面高度 812 vs 848,两分钟内变了。** 换的只有视频。**CSS 盒子不会跟着视频改高度。**

所以:**盒子一直是对的,是画面在盒子里没填满** —— iOS 上这个 `<video>` 的
`object-fit: cover` **没有生效**,视频是 letterbox 进一个尺寸正确的盒子里的。

这也解释了 `scale(1.2)` 为什么毫无作用:**放大元素,里面的黑边跟着一起放大。**
前十三轮改的全是盒子,而盒子从头到尾没错过。

### 7g. 现在的做法:自己算 cover,不指望 `object-fit`

`coverVideos()`(`public/js/app.js`)按**视频自己的宽高比**给元素设像素尺寸,居中盖住屏幕:

```js
const scale = Math.max(W / vw, H / vh);   // W/H 取所有屏幕数的最大值 × 1.12
v.style.width  = vw * scale + 'px';
v.style.height = vh * scale + 'px';
v.style.left/top = 居中;
v.style.objectFit = 'fill';
```

**关键在于:盒子和画面一旦同形状,`cover` / `contain` / `fill` 三者结果完全相同** ——
浏览器选哪个都无所谓,黑边没有地方可去。

- **过大是免费的**(多裁一点没人看的背景),**过小才是 bug** —— 所以取最大值再乘 1.12,
  而不是去找"那个正确的屏幕高度"。前十三轮都在找那个不存在的数。
- 监听 `loadedmetadata` / `loadeddata`:**换片时页面不会 resize**,而那正是缺口从
  下面跑到上面的那一刻。
- `.bg-video` **已从 `fitLayer()` 的闭环里移除** —— 把一个 letterbox 的元素撑大,
  只会把 letterbox 一起撑大。
- CSS 里给了 `100vw/100vh` 的兜底尺寸,只为了 metadata 到达之前那一帧,以及脚本没跑起来的情况。

回归测试:给 `<video>` 假的 `videoWidth/videoHeight`(横片 1920×1080 和竖片 1080×2340
各一次),派发 `loadedmetadata`,断言**元素的宽高比等于视频的宽高比**,并且四边都盖过屏幕。

### 7h. 三层保险(2026-08-29,第十四轮)

前十三轮的共同点:**每一轮都在赌某个数诚实地报告了屏幕。** 同一块屏幕在不同时刻报过
684 / 692 / 792 / 874,而每一轮都是在这几个数之间选一个。**这一轮不选了**,改成三条
互相独立的保险,任何一条单独成立就看不到边:

**① 视频按自己的宽高比、超额覆盖。** `coverVideos()` 的余量从 1.12 提到 **1.35** ——
最坏的一次分歧(874 vs 684)是 28%,余量必须大过它。中心点取的是**实测**出来的
`position:fixed; inset:0` 探针盒(`viewportBox()`),那是唯一不会说谎的数:
它不是对视口的报告,是浏览器拿 `inset:0` 实际做出来的东西。
居中是"错了两头一样亏"的唯一摆法 —— 而照片里的症状正好是一头有一头没有。

**② `#sky-bg` 不再是渐变,是当前画面本身。** 每 700ms 把活的一帧画进一张
**16×32** 的画布,拉大铺满 `#sky-bg`(放大本身就是免费的模糊)。
于是视频万一没铺到的那一条,露出来的是**同一个画面的柔化版**,不是黑带。

**③ `<html>` 的背景色 = 那一帧的平均色(×0.8)。** 这是整件事的地板:
**根元素的背景会传播到 canvas,而 canvas 按规范覆盖整个绘制面** ——
包括布局视口之外、任何元素都够不到的地方。不管别的哪里出错,
**最后面那层现在是当前天空的颜色,不是黑色。**

> 两张照片测出来的缺口是**精确的 rgb(5,6,15)** —— 那既是 `#sky-bg` 渐变的末端,
> 也是 `<html>` 画在 canvas 上的颜色。**所以缺口从来不是"洞"**:那里一直有东西在画,
> 只是画的是一片死黑,而死黑贴着流动的风景就读成了一条杠。②③ 就是不再画死黑。

跨源视频会污染 canvas,`toDataURL` 和 `getImageData` 都会抛 —— App 的视频是从站点流的,
所以这是真实情况。**抛了就保持原样的渐变,不破坏任何东西**(try/catch,已在代码里)。

### 7i. 第十五轮:把那条边当成屏幕的边,而不是要填的洞

**先记一条我自己造的倒退。** 7h ③(每 700ms 把画面平均色写进 `<html>` 背景)
**必须撤掉,而且不要再加回来**。照片量出来:那条边从我们自己的 `#05060f`
变成了**纯白 255,255,255**,还是同样的 62.0pt —— 比原来难看得多。
WebKit 用根元素的背景去画 web 内容之外的区域,**它不跟一个每秒被改两次的值**,
跟丢了就回落到白。样式表里那句 `html { background-color: #05060f }` 是稳定值,
能被正确传播,**别去动它**。7h ①② 保留。

**然后是这一轮真正做的事:不再试图填掉那 62pt,而是承认它就是屏幕的边。**

```js
short = skyTarget() - viewportBox().bottom     // 实测,不是推断
root.style.setProperty('--strip-bottom', short + 'px')
```
```css
--safe-bottom: max(env(safe-area-inset-bottom, 0px), var(--strip-bottom, 0px));
```

**一个值,底部所有控件一起动** —— 两个入口按钮、页脚链接、正在播放那一行、
阅读页自己那一排。页面本来就都用 `--safe-bottom` 摆位,所以只改这一行定义就够了。
在页面确实铺到底的手机上 `--strip-bottom` 是 0,一切和以前一模一样。

**为什么这是对的做法:** 控件**避开**那条边,看起来是刻意留的边距;
控件**压在**那条边下面,看起来就是坏了。Owner 的原话就是这个意思 ——
把按钮放到白条上面去,整体反而好看。

⚠️ `measureStrip()` **只会往上抬,而且封顶 160px**。量错了不能把按钮推到天空中间去。

### 7j-0. ⚠️ 7i 那条 CSS 写法必须用 JS 写成纯数字,别再写回去

7i 里那句:

```css
--safe-bottom: max(env(safe-area-inset-bottom, 0px), var(--strip-bottom, 0px));
```

**部署成功了,线上是新代码,而 Owner 报告"完全没有改变"。** 两个原因,都要堵:

1. **CSS 太深了。** 这是 `env()` 套在 `max()` 里、套在自定义属性里、再被 `calc()` 用。
   **四层**。任何一层不支持,整条声明被丢弃,底部所有控件**静悄悄地失去边距** ——
   而"声明被丢弃"和"根本没部署"在屏幕上长得一模一样。
   现在由 `placeBottomControls()` 算好,写成**一个纯像素数字**。没有任何东西需要被支持。
2. **测量可能量出 0。** `strip = skyTarget() - viewportBox().bottom` 只有在
   `screen.height` 对玻璃诚实时才等于那 62pt。而这台手机为同一块屏幕报过四个数。
   要是它报的是短的那个,差值就是 0,**什么都不动** —— 正是"完全没有改变"的样子。
   现在有 **`MIN_BOTTOM = 60` 的地板**:量出来再小,也至少留 60px。它**不可能量到零**。

`/diag.html` 的 "What the app measured" 现在会打印 `clearance under the bottom buttons`。
**小于 60px 就说明手机上跑的是旧版**,而不是"修了没用" —— 这两件事已经被混了一个星期。

### 7j-1. ⚠️ 那个"抬起底部控件"的做法是错的,已全部撤回,别再做一次

7i / 7j-0 让脚本把 `--safe-bottom` 写成
`max(安全区, 实测的 strip, 60px 地板)`。**结果比它想避开的问题更糟:**

- **主屏幕 App 上**:页脚下面空出 **136pt**,两个按钮浮在屏幕中间偏上;
- **Safari 里**:视口下面那块是**浏览器自己的工具栏**,根本不需要避开 ——
  于是按钮被推到了屏幕正中。

**那条 strip 不是要留的边距。** 底部控件就该贴着屏幕下沿,
由样式表里的 `env(safe-area-inset-bottom)` 决定,**别的什么都不要参与**。

`placeBottomControls()` / `safeAreaBottom()` / `MIN_BOTTOM` 全部删除。
`--safe-bottom` 回到纯 `env()`。`sky-feedback-test.mjs` 里加了断言:
**脚本不许往 `--safe-bottom` 里写任何东西**,而且按钮离下沿必须 < 60px。

strip 的数值仍然记进 localStorage、仍然在 `/diag.html` 里显示 —— **只看,不作数**。

### 7j. Chrome 加到桌面还叫 "Starry Mind" —— 两个原因

1. `public/js/i18n.js` 的 `en.appName` **还是 `'Starry Mind'`** —— 站上唯一还留着这个词的地方
   (`index.html` 第 27 行那段注释是在讲这件事,不是在用它)。已改成 `Are you alright?`。
2. **`manifest.json` 不在 `public/_headers` 里**,Chrome 对 manifest 缓存又硬又久,
   而它的 URL 里没有版本号 —— 所以一份几个月前的旧 manifest 可以一直提供旧名字。已加
   `no-cache`。

Safari 用的是 `apple-mobile-web-app-title`(早就对了),Chrome 用的是 manifest 的
`short_name` —— **两个来源,所以两个名字**,这就是"同一个网址两个浏览器两个名字"的全部原因。


`/diag.html` 现在多了一段 "What the app measured",直接列出每一层画到哪儿、差多少、
以及是不是 standalone。**拿那一段的截图**,不要再拿主页截图 —— 主页截图只能告诉我"还有边",
那一段能告诉我是哪一层、短多少。
