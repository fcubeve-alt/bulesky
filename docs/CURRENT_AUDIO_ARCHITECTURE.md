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
