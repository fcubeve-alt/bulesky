# CLAUDE.md

## Project memory — READ BEFORE TOUCHING THESE AREAS
- **The drifting sky / balloon feed** (`public/js/scene.js`, `.lantern*` in `public/css/style.css`, the `/api/bubbles` list in `functions/api/bubbles/index.js`, and the fetch/pin/refresh in `public/js/app.js`): **read `docs/SKY_FEED.md` first**, then verify every rule there still holds after your change. It captures hard-won decisions (per-viewer weighted sampling, the capped "river", 3–4 depth tiers, per-layer rise speed, mobile width/drag, author-pin). Do not regress one rule while fixing another.
- **举报 / 内容安全**(`functions/api/report.js`、阅读页的举报按钮、隐藏后的可见性):改前先读 `docs/ROADMAP.md` §7c —— AI 判断与"3 次兜底"是两条**互相独立**的隐藏路径,AI 出错必须 fail open。
- **博客与后台**(`functions/blog/`、`functions/api/admin/`、`public/admin.html`、`src/markdown.js`):见 `docs/ROADMAP.md` §7d。博客内容在 D1,不在文件里;新增动态路由要同步改 `public/_routes.json`。
- **背景视频 / 首屏速度**(`public/js/backgrounds.js`、`public/index.html` 里两个 `<video>`、`public/sw.js`、`tools/shrink-video.mjs`):改前先读 `docs/ROADMAP.md` §7e。`preload="none"`、延后 `prepareNext()`、SW 不拦 `/video/` 与 `/music/` —— 这三条都是拿限速实测换来的,别随手改回去。新加的片子必须过 `tools/shrink-video.mjs`。
- **朗读 / Listen**(`src/tts.js`、`functions/api/voice/[id].js`、`ambient.js` 的 `duck()`、app.js 的 `toggleListen`):改前先读 `docs/ROADMAP.md` §7f。**懒生成 + 永久缓存是产品硬要求**——发布不生成、缓存命中时零外部调用、只能由 Listen 按钮触发(绝不自动播放);**表演指示(`DELIVERY`)就是这个功能本身**,别当成可有可无的参数删掉;音色故意不进 hash;没 key / 分类器坏掉都必须降级而不是变成坏按钮。**provider 是一条链,不是选一个:OpenAI 兼容中转站(线上是 OpenRouter 免费模型)→ Workers AI 的 Aura → MeloTTS,前面的失败就试下一个**——这里要防的失败不是"声音不够好听",是"没有声音"。链条 2026-08 从六家砍到三家(ElevenLabs / 火山 / Gemini 都删了,见 §7f),**但"只留一家"不行**:后面两条不要 key、不要卡,是中转站没额度那天唯一还会出声的东西。
  - **⚠️ 一条朗读只能有一个人在读。** 长悄悄话是**分片、分别请求**再拼起来的,所以任何"这个不行就换下一个"的写法,含义都会从"重试"变成"下半段换个人念"——音色表每个角色只留一个 id、一片都不许换音色重试、缓存写入要 DELETE+INSERT 同批(否则两次合成会交错成"前半段 A + 后半段 B")、客户端出过声之后不许再退回手机自带的声音。**中转站的音色也不许靠模型名匹配去猜**:猜不中就会发 OpenAI 的名字过去,对方不认识就自己挑,而且每次挑的可能不一样。
  - **⚠️ 这个 endpoint 永远不能返回 5xx**:Pages Function 返回任何 5xx,Cloudflare 边缘会把 body 换成它自己那个 16 字节错误页。失败也要返回 `200` + JSON,前端**按 `content-type` 判断**。之前"神秘的 502 + 日志里什么都没有"就是这么来的——worker 一直好好的,是我们的解释被边缘丢掉了。
  - **⚠️ 选音色不要调 Workers AI**:`pickVoice()` 曾在每次缓存未命中时都跑一次,**不管配的是哪个语音服务商**,所以换服务商从来没解决问题。现在改成本地哈希(`pickVoiceLocally`),`VOICE_CLASSIFIER=1` 才开回 AI 选角。
  - **⚠️ 从点击到出声之间不能有 `await`**——`play()` 和 `speechSynthesis.speak()` 都受 iOS 手势限制,这条已经踩过三次。
- Product strategy & roadmap: `docs/ROADMAP.md`.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
