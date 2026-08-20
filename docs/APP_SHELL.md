# App 外壳(Capacitor)—— 怎么打包、怎么上架

> 网站不会消失。App 和网站是**同一片天空、同一个后端、同一套前端文件**;
> 这个目录只是把 `public/` 装进一个手机 App 里,再补上浏览器做不到的那几件事。
> 决策背景见 `docs/APP_PRD_REVIEW.md` §八(为什么是 Capacitor 而不是重写)。

## 已经做好的(代码在仓库里,网站照常跑)

| 东西 | 在哪 | 说明 |
|---|---|---|
| 接口地址可配置 | `public/js/config.js` | 网站上用相对路径,App 里自动指向 `https://cubewithin.com` |
| 跨域(CORS) | `functions/_middleware.js` | App 里每个请求都是跨域的,没有这个 App 一行数据都拿不到 |
| 原生能力 | `public/js/native.js` | 触觉、系统分享、状态栏、安卓返回键 —— **有插件用插件,没有就退回网页 API,再没有就什么都不做** |
| 外壳工程 | `app/` | 独立的 `package.json`,**故意不放进根目录**:部署会跑 `npm install`,不该顺手装一个浏览器 |
| 打包内容 | `app/sync-www.mjs` | 从 `public/` 复制,**去掉视频、音乐、后台页、Service Worker** |

**包只有 332KB**(视频音乐从网上流,不塞进安装包 —— 否则首次下载就是 25MB+)。

## 打包(需要 SDK 的机器,或者云端构建)

```bash
cd app
npm install
node sync-www.mjs          # 每次改完网站都要重跑
npx cap add ios            # 只需一次
npx cap add android        # 只需一次
npx cap sync               # 每次改完
```

`ios/` 和 `android/` 是**生成物,不进版本库**(`app/.gitignore`)。真正打包要么在有 Xcode / Android Studio 的机器上,要么在 Codemagic 那类云端构建上 —— **站主没有 Mac,也不需要有**,细节见 `docs/APP_PRD_REVIEW.md` §九。

## 三条硬规矩

1. **⚠️ 不要在 `app/` 里维护第二份前端。** 选 Capacitor 的唯一理由就是"同一套文件",一旦有人在 `www/` 里直接改东西,这个理由就没了。`www/` 是生成的,已经进 `.gitignore`。
2. **⚠️ 后台页(`admin.html`)不进 App。** 审核是桌面上的活,而且一个装在商店审核过的 App 里的后台入口,会引来没人想回答的问题。CORS 那边也一并挡掉了 `/api/admin/*` —— **连 App 自己都不许调**。
3. **⚠️ App 里不注册 Service Worker。** 文件本来就在手机上,再套一层缓存只会有一天给你一个旧版本。

## 上架前还差的(按顺序)

- [ ] 图标和启动图(`app/resources/`,用 `@capacitor/assets` 生成)
- [ ] 深链:`?w=<id>` 已经能用,但要让**点链接直接开 App**,得在网站根目录放 `apple-app-site-association` 和 `assetlinks.json`(要 App ID / 签名指纹,现在还没有)
- [ ] 通知:只做一种 —— **"有人给你的气球点了灯 / 回了信"**。这个产品不该有第二种理由打扰任何人
- [ ] 隐私清单(iOS `PrivacyInfo.xcprivacy`):这个 App 不收集任何东西,但**"不收集"也要如实申报**
- [ ] Apple Developer $99/年 —— **先确认这张卡付得了**,同 §九

## 怎么验

```bash
cd app && node sync-www.mjs
python3 -m http.server 8790 --directory app/www &
node tools/app-shell-test.mjs   # 假装自己在 App 里,看它到底去哪里要数据
node tools/cors-test.mjs        # App 能过、后台不能过
```

`app-shell-test.mjs` 盯的是**打开网站根本看不出来的那个错**:App 里 `/api/...` 指向的是手机上的安装包,不是服务器。base URL 一错,整个 App 是死的,而网站一切正常。
