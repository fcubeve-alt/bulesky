# CURRENT_AUDIO_ARCHITECTURE

> Hybrid TTS 集成文档的第 1 步要求:**先审计现有系统,不直接重写。**
> 这份文件写的是**现在线上到底是怎么跑的**,不是计划。改动前先读它,再读 `docs/ROADMAP.md` §7f 和 `CLAUDE.md` 里"朗读 / Listen"那一段。

---

## 1. 一句话

**朗读是按「文本」缓存的,不是按「气球」缓存的;懒生成、永久保存;从来不在发布时生成。**

---

## 2. 数据流

```
用户点 Listen
  → GET /api/voice/{bubble_id}
      → 从 D1 读这条气球的正文(hidden 的读不到)
      → hash = SHA-256(RECIPE + provider + model + type + 正文)
      → readVoice(hash):先 R2,再 D1
          命中 → 直接返回音频字节(零外部调用)
          未命中 → pickVoiceLocally(正文) 选音色
                 → synthesize():provider 链依次尝试
                 → 立刻把字节返回给听众
                 → waitUntil() 里再写进存储
```

**返回的是音频字节,不是 URL。** 前端拿到的是 blob,不是可以贴给别人的地址。

---

## 3. 关键事实(集成时最容易搞错的几条)

| 项目 | 现状 |
|---|---|
| 端点 | `GET /api/voice/{id}`,`functions/api/voice/[id].js` |
| 缓存键 | **正文的 hash**,不是 balloon_id。两条一模一样的悄悄话共用同一份音频 |
| hash 材料 | `RECIPE`(现为 `v15-shorter-pieces`)+ provider 名 + Aura 模型名 + type(pain/wish)+ 正文 |
| 音色 | **故意不进 hash**(`src/tts.js`),换音色不会让旧朗读失效 |
| 存储 | `VOICE_BUCKET` 绑了就写 R2(`voice/{hash}`),没绑就写 D1 `voice_chunks`,按 900,000 字节分片 |
| **当前实际存储** | **D1**——`wrangler.toml` 里 `[[r2_buckets]]` 还是注释掉的 |
| 读取顺序 | 先 R2 后 D1,两边都读,老数据不用迁移 |
| provider 链 | `openai`(线上是 OpenRouter 中转)→ `aura`(Workers AI)→ `melo`。**前面失败就试下一个** |
| 格式 | AAC(不是 MP3),`MAX_CHARS = 1200`,分片 `CHUNK_CHARS = 140` |
| 生成时机 | **懒生成**。发布不生成;没人点过 Listen 的气球从未被合成过 |
| 失败行为 | **永不返回 5xx**。失败也是 `200` + JSON,前端按 `content-type` 判断 |
| 错误日志 | `voice_errors` 表;`/api/voice/{id}?probe=1` 出诊断 |
| HTTP 缓存 | 音频 `public, max-age=86400`,支持 Range |
| 写入并发 | 缓存写入是 DELETE+INSERT 同一个 `batch()`,防止两次合成交错 |

---

## 4. 三条「不能碰」的硬规则

来自 `CLAUDE.md`,不是建议:

1. **一条朗读只能有一个人在读。** 长文本是分片、分别请求再拼起来的。任何"这片失败就换个 provider 重试这一片"的写法,含义都会变成"下半段换个人念"。一片失败 → 整次失败 → 下一个 provider **从头读完整段**。
2. **这个 endpoint 永远不能返回 5xx。** Pages Function 返回 5xx,Cloudflare 边缘会把 body 换成它自己那个 16 字节错误页,我们写的任何解释都会被丢掉。
3. **从点击到出声之间不能有 `await`。** `play()` 和 `speechSynthesis.speak()` 受 iOS 手势限制,这条踩过三次。

---

## 5. 现在的成本形状

不是靠限流控制的,是靠**结构**:

- 一条气球**最多只会被合成一次**,无论多少人点、点多少次。
- 集合是有限的(气球总数),所以总成本有上限。
- **不随流量增长,只随"被听过的不同气球数"增长。**

这一点很重要:**现有系统已经是 "Generate Once, Store Once, Play Many Times" 了。** 新方案要改的不是"有没有永久音频",而是"永久音频用谁的声音"。

---

## 6. 与 Hybrid TTS 文档的对照 —— 三个必须先决定的冲突点

### 6a. `permanent_audio_url` 字段和现有设计是冲突的

文档建议在 balloon 上加 `permanent_audio_url`。但现在音频**根本不属于某一条 balloon**,它属于一段**文本的 hash**。

- 加 URL 字段 = 把 "audio 属于文本" 改成 "audio 属于气球",要动数据库、端点、播放逻辑,并且**丢掉相同文本自动去重**。
- 不加字段的做法:VoiceStudio 生成的音频,**按同一套 hash 规则写进同一个存储**。`/api/voice/{id}` 一个字都不用改——它会命中缓存,直接播出品牌声音。

**我的建议是后者。** 它把改动量从"重做音频子系统"降到"加一个能写存储的 worker",而且状态机(NO_AUDIO / TEMP_READY / PERMANENT_READY)大部分可以省掉:缓存里有没有那份 hash,本身就是状态。

### 6b. 「每晚给所有新气球生成永久音频」会打破懒生成

文档第 8 节要求每晚把当天所有新增内容都重新生成一遍。这和 `CLAUDE.md` 的"**发布不生成**"是直接冲突的。

- 现在:没人听过的气球,永远不占存储、不花一分钱。
- 改后:每一条气球都会被合成、都会占 R2。

本地 GPU 的边际成本是电费不是钱,所以**这可能是可以接受的**——但它必须是一个**明确的决定**,而不是顺手的副作用。要考虑的是 R2 存储量从"被听过的条数"变成"全部条数"。

**折中方案**:只永久化**至少被听过一次**的气球(即缓存里已经有临时版本的),外加作者自己的。这样既统一了声音,又保住了成本形状。

### 6c. 本地 Worker 需要一条**写生产存储**的通道 —— 文档完全没提

这是我最在意的一条。Worker 要把音频写进线上 R2,意味着要开一个**从 Owner 的 Windows 电脑写入生产环境的认证通道**。

必须满足:
- **独立的 token**,不能复用 `ADMIN_PASSWORD`。
- 只能写音频,不能碰别的。
- **别人不能往任意气球塞任意音频**——否则这是一条内容投毒路径(把一条温柔的悄悄话配上恶意音频)。
- token 泄露时能单独吊销。

### 6d. ffmpeg 后处理必须进 hash

EQ + 去齿音那两步是**声音配方的一部分**。如果它变了而 hash 没变,音频库里就会同时存在两种听感的成品,而且分不出来。

建议把 `RECIPE` 从 `v15-shorter-pieces` 换成能表达完整配方的版本号,例如 `aya_brand_voice_v1`,并且**profile id + pitch + guidance + speed + seed + ffmpeg 链**任何一项变化都要升版本。

---

## 7. 我不能替你验证的部分

`http://127.0.0.1:3900` 是**你那台电脑上的地址**。我跑在一个云端容器里,**没有任何路由能到达它**——这不是权限问题,是网络拓扑问题。

所以:
- VoiceStudio 的 `/generate` 实际返回什么、GPU 够不够、长文本会不会超时——**只能你那边测**。
- 我能做的是:按文档写出 Worker,并在这边**用一个假的 `/generate`(返回真 WAV)把 Worker 端到端跑通**,包括质量闸、上传、重试、离线补跑。这样你拿到手上时,唯一没验过的只剩"真 VoiceStudio 的响应",其余都验过了。

---

## 8. 涉及的文件

| 文件 | 作用 |
|---|---|
| `functions/api/voice/[id].js` | 端点。缓存命中、provider 调用、错误 JSON、Range |
| `src/tts.js` | 配方。`DELIVERY`、provider 链、分片、音色表、`voiceHash` |
| `src/voice-store.js` | 存储。R2/D1 二选一,读时都读 |
| `public/js/app.js` | `toggleListen`,按 content-type 判断,出过声之后不退回手机声音 |
| `public/js/ambient.js` | `duck()`,朗读时压低背景音乐 |
| `migrations/0009–0013` | `voice_chunks`、`voice_errors` 及一次修正分片交错的迁移 |
| `.github/workflows/clear-voice-cache.yml` | 手动清空朗读缓存 |
| `tools/voice-store-test.mjs`、`tools/listen-test.mjs` | 现有测试 |

---

## 9. 品牌音色回填(2026-08)—— §6 那四个冲突点的答案

Owner 的要求是一句话:**"把现在所有气球的音频重新生成,用我们自己的已调好的音色。"**
下面是这句话落成的东西,以及 §6 每一条是怎么解掉的。

### 9a. 有一件事我在这里做不了,必须写在最前面

**VoiceStudio 在 `127.0.0.1:3900`,那是 Owner 那台 Windows 的地址。** 云端容器没有任何
路由能到它 —— 这不是权限,是网络拓扑(§7)。所以**声音本身只能在那台机器上生成**。

这一节做的是把"生成"之外的所有环节都建好并验过,让那台机器上只剩**一条命令**:

```bash
node tools/revoice.mjs --all --upload
```

### 9b. 品牌朗读有自己的键,而且**故意不带 provider**

`src/tts.js` 新增 `brandVoiceHash(text, type)` → `aya-<sha256>`。

`voiceHash()` 把 provider 和 Aura 模型名写进 hash,对**机器音**是对的:换了中转站,听到的
东西就变了,老行本来就该作废。**对品牌音是完全错的** —— 这份音频不是任何 provider 生成的,
是在某人的 GPU 上一次性做出来的。要是键上带了 provider,那么**中转站关掉、或者免费额度用完
那天 `providerFor()` 落到 aura**,整个音频库会**悄无声息地失效**,所有悄悄话退回机器音,
而那是一整夜的生成。

键里也**没有配方版本号**,同样是故意的:一段文本只有一份品牌朗读,所以配方变了是**覆盖**
而不是并存 —— 音频库永远不可能同时存在两种听感,而这正是版本号本来要防的事(§6d)。
"配方变了之后让全库保持一致"是**上传端的职责**,见 9e。

`aya-` 这个前缀不是装饰:品牌音和机器音在同一个桶、同一个 `voice/` 前缀下,没有标记就没法
回答"天空读了多少了",除非把全站文本重新哈希一遍。有了它就是一次 R2 list / 一个 LIKE。

### 9c. 读取路径:品牌朗读优先

`functions/api/voice/[id].js` 现在**先查品牌键,再查机器键**。命中即返回,**零外部调用** ——
和 CLAUDE.md 那条硬要求是同一条,只是提前了一次查询。回填做完之后,每一次请求都停在这里。
没命中多花一次存储读取,这是"还没读到的那些悄悄话"的全部代价,读完就归零。

> ⚠️ `tools/revoice-test.mjs` 里那条 **"把所有 provider 拿掉"** 的断言是这一整套东西的根:
> 没有 key、没有 AI 绑定时,端点只剩一条路能返回音频。它要是绿的,回填就是有意义的;
> 它要是红的,一整夜的生成没有任何人听得到,而且**没有任何地方会报错**。

### 9d. 门:`/api/voice/backfill` —— 解 §6a 和 §6c

**§6a(要不要加 `permanent_audio_url` 字段)** :不加。按 §6a 自己的建议走后者 ——
VoiceStudio 生成的音频按同一套存储规则写进同一个桶,`/api/voice/{id}` 的播放逻辑一个字没改,
数据库没动,状态机省掉了(**缓存里有没有那份 hash,本身就是状态**)。

**§6c(从 Owner 的电脑写生产存储的通道)**:

| 要求 | 怎么满足 |
|---|---|
| 独立 token | `VOICE_UPLOAD_TOKEN`,**不是** `ADMIN_PASSWORD`。它会进 shell history 和桌面上的脚本,不能和后台密码是同一个 |
| 只能写音频 | 这个端点只会调 `writeVoice()` |
| **别人不能往任意气球塞任意音频** | **调用方不选键。** 它只发 `id` + 字节,键由服务端从**那条气球当前的正文**推出来。token 泄露的最大危害是"把一段朗读换成另一段朗读",不是"给一句温柔的话配上恶意音频" |
| 能单独吊销 | 单独一个 secret,`wrangler pages secret put VOICE_UPLOAD_TOKEN` |

另外:隐藏的气球拿不到声音(和 `/api/voice/{id}` 同一条规则),空正文拿不到,
小于 2048 字节的拒收(和合成路径同一条底线 —— **永远不存放不出来的东西**),
超过 8MB 的拒收,`content-type` 不是 `audio/*` 的拒收。

`GET` 列的是**全库、按 id 分页**,**故意不是 `/api/bubbles`** —— 那是天空的**按人加权抽样**
且有上限(`docs/SKY_FEED.md`)。拿它当"全部"来读,会静悄悄漏掉大半个站,而且**每次漏的还不
是同一半**。对一个存在意义就是"一条都不落下"的任务,这是最坏的失败方式。

### 9e. 配方变了怎么办 —— 解 §6d,而且不需要先问 Owner 要 EQ 链

`tools/revoice.mjs` 里那串 ffmpeg EQ / 去齿音**现在仍然是猜的**(`HANDOVER.md` §3.2 第 3 条)。
但它已经**可以安全地被替换**了:

`RECIPE`(profile / pitch / speed / seed / guidance)和 `FILTER` 一起哈希成一个 `RECIPE_ID`,
写在 `<out>/read.json` 里每一条朗读旁边。**改掉其中任何一个,下一次运行就会把用旧配方做的
全部重读一遍。** 所以"万一链子是错的"的答案是:改那一行字符串,跑同一条命令,走开。

**不可能发生的**,正是那个本来无法挽回的情况 —— 半个库一种听感、半个库另一种,而且分不出来。

### 9f. 断点续传是常态,不是例外

一台 GPU 读完一整片天空要很久,**一定会被打断**。所以:

- `<out>/read.json` 记账,第二次运行跳过已完成的。
- **账在站点确认之后才记,并且立刻落盘。** 先记账后上传的话,崩一次就会丢一条朗读却声称
  它做完了 —— 那是续传唯一救不回来的失败。
- 账按 id 记,但**比对的是 hash**,所以账本永远不会声称自己持有的是另一段话的朗读。
- `--upload` 拒绝 `--no-post`:WAV 大约是 AAC 的 17 倍,手机喇叭上听不出区别,但存储账单
  会永久乘以 17。

### 9g. Owner 那边要做的(一次性)

**1. 定一个 token,填进 GitHub(不用装 wrangler,不用命令行)**

GitHub 仓库 → Settings → Secrets and variables → Actions → New repository secret
名字 `VOICE_UPLOAD_TOKEN`,值随便一串长的随机字符(自己记住,下一步要用)。
然后跑一次 **Actions → Deploy to Cloudflare** —— 部署会把它同步进 Cloudflare Pages,
和 `ADMIN_PASSWORD`、`OPENAI_API_KEY` 走的是同一条路。没填它只会出一条 warning,
不会让部署失败,`/api/voice/backfill` 就只是关着。

**2. 在那台 Windows 上,先试听五条 —— 什么都不会被上传**

```bat
node tools/revoice.mjs
```

**3. 听着对了,再读整片天空(可以随时 Ctrl-C,再跑一次会接着来)**

```bat
set VOICE_UPLOAD_TOKEN=第一步那串
node tools/revoice.mjs --all --upload
```

`GET /api/voice/backfill` 会顺便报 `total` 和 `made`,所以**进度是能看见的** ——
一整夜的生成不该是瞎跑。

### 9h. 这没有打破"发布不生成"

**发布仍然不生成任何东西。** 回填是一次**手动触发的、离线的**批处理,不在发布路径上,
也不在请求路径上。§6b 担心的"每晚自动给所有新气球生成"没有实现,也不建议实现。

