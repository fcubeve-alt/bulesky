# 心灵星空 (Starry Mind) — 项目总览文档

> 最后更新:2026-07-26 · 状态:**已正式上线** · 线上地址:<https://cubewithin.com>

这份文档记录整个项目的全貌:是什么、怎么搭的、部署在哪、怎么运维,以及上线过程中踩过的坑和结论。给自己或后来者一个"看完就懂"的入口。README 偏部署命令,PRD(`docs/PRD.md`)偏产品需求,本文是**工程 + 运维全景**。

---

## 一、这是什么

一个**匿名、免登录**的倾诉 / 许愿 Web App。用户无需注册账号:

- 发一条 **"痛苦气泡"(pain)** 或 **"愿望流星"(wish)**;
- 自己取一个 **名字/代号(code)** —— 现在这是一个"个人昵称",一个人可以用同一个名字发很多条,`find` 能按名字列出这个人的所有低语;
- 全球所有人共享同一片星空,任何人都能读、能回复,支持多语言。

内容以"漂浮的气泡 / 升起的灯笼"形式呈现在一个沉浸式星空场景里,配自动轮播的背景视频和背景音乐。

> ⚠️ 注意:仓库里的 `README.md` 有一句旧描述"随机 4 位后缀"——那是早期设计,**已废弃**。现在 code 就是用户自取的个人昵称,不加后缀(见迁移 `0003_person_codes.sql`)。以本文为准。

---

## 二、技术栈 & 架构

一站式跑在 **Cloudflare** 上,无独立后端服务器、无构建步骤(纯 HTML/CSS/ES modules)。

| 层 | 技术 | 说明 |
|----|------|------|
| 前端静态资源 | **Cloudflare Pages** | 直接托管 `public/`,无打包 |
| API | **Cloudflare Pages Functions** (`functions/`) | 与前端同一个 Pages 项目,一次部署 |
| 数据库 | **Cloudflare D1** (SQLite) | 存气泡和回复,见 `migrations/` |
| 定时清理 | **独立 Worker** `cron-worker/` | Pages Functions 不能被 cron 触发,所以单独一个 Worker 每天删过期内容 |
| 媒体抓取 | **GitHub Actions + `tools/fetch-media.js`** | 定期抓取合规免费的背景视频 / 音乐,提交进仓库 |

**Cloudflare 资源名:**
- Pages 项目:`bulesky` → 默认地址 `bulesky-cid.pages.dev`,自定义域名 `cubewithin.com`
- D1 数据库:`bulesky-db`
- 清理 Worker:`bulesky-cleanup`(每天 03:00 UTC,`RETENTION_DAYS=180`)

---

## 三、仓库结构

```
.
├── public/                     # 前端(Pages 直接托管)
│   ├── index.html              # 单页外壳 + SEO/社交分享 meta(指向 cubewithin.com)
│   ├── css/style.css
│   ├── js/
│   │   ├── app.js              # 主逻辑:取数、发布、渲染、find
│   │   ├── scene.js            # 星空 / 气泡 / 灯笼 3D 场景渲染
│   │   ├── backgrounds.js      # 背景视频轮播 + 音乐
│   │   ├── ambient.js          # 背景音乐控制
│   │   └── i18n.js             # 多语言(默认英文)
│   ├── manifest.json           # PWA
│   ├── sw.js                   # Service Worker
│   ├── qr.png                  # 分享二维码 → https://cubewithin.com
│   ├── icons/icon.svg
│   ├── music/                  # 背景音乐库 + manifest.json(当前 ~56 首)
│   └── video/                  # 背景视频库 + manifest.json(当前 ~40 条)
├── functions/api/              # Pages Functions(API)
│   ├── bubbles/index.js        # GET 列表 / POST 发布;支持 ?code= 按名字查
│   ├── bubbles/[id]/index.js   # GET 单条详情
│   ├── bubbles/[id]/replies.js # GET/POST 回复
│   ├── bubbles/by-code/[code].js
│   └── report.js               # 举报
├── src/filters.js              # 内容安全过滤(关键词 / 联系方式 / 危机词)
├── migrations/                 # D1 schema
│   ├── 0001_init.sql           # bubbles / replies 表
│   ├── 0002_lowercase_codes.sql
│   └── 0003_person_codes.sql   # code 改为"个人昵称",去掉 UNIQUE
├── cron-worker/                # 数据保留期清理 Worker
│   ├── src/index.js
│   └── wrangler.toml
├── tools/fetch-media.js        # 媒体自动抓取脚本
├── .github/workflows/
│   ├── deploy.yml              # push 到开发分支 → 部署 Pages + Worker + 迁移
│   └── fetch-media.yml         # 定时/手动抓媒体并提交
├── wrangler.toml               # Pages + D1 绑定
├── README.md                   # 部署命令速查
└── docs/
    ├── PRD.md                  # 产品需求文档
    └── PROJECT_OVERVIEW.md     # 本文
```

---

## 四、数据模型(D1)

**`bubbles`**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增 |
| code | TEXT | 用户自取的个人昵称(**不再** UNIQUE) |
| type | TEXT | `pain` / `wish` |
| content | TEXT | 正文 |
| lang | TEXT | 语言 |
| warmth | INTEGER | 非隐藏回复数,驱动前端颜色 / 拖尾动画 |
| report_count | INTEGER | 举报数 |
| hidden | INTEGER | 是否隐藏 |
| crisis_flag | INTEGER | 危机干预标记 |
| created_at | INTEGER | 时间戳 |

**`replies`**:`id, bubble_id→bubbles(id), content, lang, report_count, hidden, crisis_flag, created_at`

---

## 五、内容安全(PRD 必须项)

在 `src/filters.js` + API 层实现:

1. **危机干预兜底** —— 命中自杀 / 自伤类词 → `crisis_flag`,前端弹求助信息。
2. **多语言关键词过滤** —— 屏蔽暴力 / 色情等 off-brand 内容。
3. **联系方式屏蔽** —— 出于法律责任,过滤微信号 / 电话 / 链接等,防止导流。
4. **举报与自净** —— `report.js`;`report_count` 累积到阈值自动 `hidden`。
5. **数据定期清理** —— `cron-worker` 每天删除超过 `RETENTION_DAYS`(默认 180 天)的内容。

---

## 六、媒体自动抓取管线

`tools/fetch-media.js`(由 `.github/workflows/fetch-media.yml` 驱动):

- **只抓合规、免费、无需付费授权**的素材:公有领域古典乐(Internet Archive / Musopen 等)、CC 授权音乐(Jamendo / ccMixter)、Pexels / Pixabay 免费视频。
- **不覆盖、不删旧** —— 媒体库只增不减(库越攒越大)。
- **每轮上限** `CLASSICAL_PER_RUN=8`,所以一批 10 首会分几轮入库。
- **音质优先** —— 优先干净的现代录音,把易有电流噪音的老 78 转转录排到最后。
- **黑名单 `BLOCKED_IDS`** —— 用户听了不喜欢 / 要求删除的曲子放进来,永不再抓。目前含:老噪音古典(raindrop / gymnopedie-1 / clair-de-lune)、几首 Jamendo(Ring Spiral / Beyond earth / Precious / **Sand dunes**),以及应用户要求删除的 **Rêverie L.68**、**肖邦夜曲 Op.9 No.2**。

**已入库的"世界名曲"精选**(电影常用、一听就认得):致爱丽丝、贝七小快板、帕赫贝尔卡农、马斯涅《沉思》、维瓦尔第四季·冬 Largo、舒伯特小夜曲、普契尼《我亲爱的爸爸》。
**暂缺**:莫扎特第21钢协·行板、格里格《晨景》—— 几轮都没抓到符合音质门槛的公有领域录音。

---

## 七、部署

### 自动部署(日常)
push 到开发分支 `claude/lingxingkong-prd-t1x2mg` → 触发 `deploy.yml`,它会:
1. 确保 D1 数据库存在,解析真实 `database_id` 并 sed 进 `wrangler.toml`;
2. 应用所有 `migrations/*.sql` 到远程 D1;
3. 确保 Pages 项目存在(生产分支 `main`);
4. **部署 Pages(前端 + API)到生产**;
5. 部署 `cron-worker`。

> `fetch-media.yml` 抓到新媒体提交后,也会因为 push 到开发分支而自动触发 `deploy.yml` → 新素材自动上线。

### ⚠️ 关键坑(已修复):生产 vs 预览
`deploy.yml` 在开发分支上跑,但 Pages 生产分支是 `main`。`wrangler pages deploy` 默认按当前分支名判定:分支 ≠ 生产分支 → 发成**预览部署**,生产地址(以及自定义域名)会是空的 "Nothing is here yet"。
**修复**:部署命令加 `--branch=main` 强制发到生产。这是让 `cubewithin.com` 能出内容的关键。**以后不要去掉这个 flag。**

### 所需 GitHub Secrets
`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`(两个 workflow 都用)。媒体抓取另需 `JAMENDO_CLIENT_ID`(没有则跳过 Jamendo)。

---

## 八、域名与 DNS(重要,容易混)

- **域名**:`cubewithin.com`,注册在**阿里云**,但**权威 NS 已指向 Cloudflare**(`shubhi/kenneth.ns.cloudflare.com`)。
- 👉 **真正生效的 DNS 全在 Cloudflare 管**。阿里云控制台里那份解析记录是**不生效的"僵尸记录"**(阿里云页面顶部黄条已明说)。**别去阿里云改 NS,否则 Cloudflare 记录全失效、网站会挂。**
- **网站记录**(Cloudflare,Proxied 橙云):
  - `cubewithin.com` → CNAME → `bulesky-cid.pages.dev`
  - `www.cubewithin.com` → CNAME → `bulesky-cid.pages.dev`(如已配)
- **⚠️ VPN 子域名(与本项目无关,勿动)**:同一域名下有一批给 Trojan/VPN 用的子域名(`tttuso`、`tttust`、`trojan` 等,A 记录 DNS-only),指向各自的 VPN 服务器 IP。**清理 DNS 时千万别删这些**,否则 VPN 断。
- **残留可清理**:Cloudflare zone 里有两条 apex `NS → dns29/dns30.hichina.com` 的残留记录(阿里云时代留下),无害,有空可删。

---

## 九、运维手册(Runbook)

### 清空所有已发布气泡(上线 / 重置用)
**不要**写成 migration(每次部署都会重跑 → 反复清空用户数据)。做法:临时加一个 `workflow_dispatch` 手动 workflow,先解析真实 `database_id` 再执行:
```sql
DELETE FROM replies;
DELETE FROM bubbles;
DELETE FROM sqlite_sequence WHERE name IN ('bubbles','replies');  -- 重置自增 id
```
跑完确认 `bubbles=0 / replies=0`,然后**删掉该 workflow**防止误触发。(2026-07-26 正式上线前已执行过一次,库已清零。)

### 重做分享二维码
```bash
pip install qrcode pillow
python3 -c "import qrcode; qrcode.make('https://cubewithin.com').save('public/qr.png')"
```
提交 `public/qr.png` → 自动部署。`index.html` 里以 `<img src="/qr.png">` 引用。

### 本地开发
```bash
npm install
npm run db:create           # 首次:把打印出的 database_id 填进两个 wrangler.toml
npm run db:migrate:local
npm run dev                 # Pages + Functions + 本地 D1
```

---

## 十、当前状态(2026-07-26 正式上线)

- ✅ 网站已上线:<https://cubewithin.com>(生产部署修复后正常出内容)
- ✅ 已发布气泡已清空(`bubbles=0 / replies=0`),干净启动
- ✅ 分享二维码已更新为新域名并验证可扫
- ✅ 页面加了 canonical + OG/Twitter 分享 meta
- ✅ VPN 子域名未受影响
- 🎵 名曲已入库 7 首,莫扎特 / 格里格暂缺(音质门槛未达标)

## 十一、待办 / 可选

- [ ] 若需要,给 `www.cubewithin.com` 加跳转(或确认已配)
- [ ] 清理 Cloudflare 里两条阿里云残留 NS 记录
- [ ] 名曲:放宽音质门槛重试莫扎特 PC21 / 格里格晨景,或换替代曲目
- [ ] 更新 `README.md` 里"随机 4 位后缀"的旧描述(现为个人昵称)
