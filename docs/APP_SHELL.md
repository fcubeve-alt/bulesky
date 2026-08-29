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

---

## 原生工程、图标、打包流水线(2026-08)

### 原生工程已经生成,而且**提交进了 git**

`app/ios/` 和 `app/android/` 在仓库里。`npx cap add` 能重新生成它们,所以看起来该 gitignore 掉 —— **但"属于我们"的东西全在里面**:图标、隐私清单、Bundle ID、构建设置、签名配置。每次构建重新生成一遍,等于把这些全丢掉,得到一个恰好加载我们页面的默认 Capacitor 应用。

所以 CI 里跑的是 **`cap sync` 而不是 `cap add`** —— sync 只把网页产物和插件拷进去,别的一律不碰。`app/.gitignore` 里剩下的都是构建产物。

**Linux 上能生成 iOS 工程**(`cap add ios` 只是复制模板,不需要 Xcode),所以这一步不卡在没有 Mac 上。

### 图标:一张图,生成全部

`public/icons/icon.svg` 是母版 —— 一只暖色气球升在夜空里,底下是湖。**没有第二张手绘的图**,改图标就是改这一个文件。

`node tools/make-icons.mjs` 用已经装着的 Chromium 渲染出所有尺寸;`node tools/install-app-icons.mjs` 把它们放到 Xcode 资源目录和 Android 的 `mipmap-*` 里。

三条商店规矩写进了工具里,因为它们都是"不照做就被拒"而不是"不照做不好看":
- **App Store 的 1024 不能有 alpha 通道,也不能自带圆角** —— iOS 自己加遮罩,圆角烤进去会在桌面上显示成一圈黑边,alpha 通道则直接在上传时被拒。所以只有这一张被压平到不透明底色上。
- **Android 自适应图标只保证内侧约 66% 可见**(遮罩形状每个厂商都不一样),所以前景是同一张图缩到三分之二,放在透明底上 —— 圆形、squircle、水滴形遮罩都能活下来。
- **启动图不是白的。** Capacitor 默认给一张白图,而这个产品的第一帧是夜空 —— 每次冷启动闪一下白,是整个 App 里最显眼的东西。

图标缩到 40px 还认得出(实测过),这是它唯一必须通过的考试。

### ⚠️ 隐私清单必须进 Xcode 的 Resources,光放在目录里没用

`app/ios/App/App/PrivacyInfo.xcprivacy` 写好了(不收集任何数据,只声明 UserDefaults 的 CA92.1,因为 Capacitor Preferences 用它存作者密钥和昵称)。

**但 Xcode 只打包工程里登记过的资源。** 文件躺在目录里没被引用 → 构建通过、上传通过、**审核以"缺少隐私清单"拒掉** —— 一个离原因很远的、很慢的失败。所以 `tools/patch-ios-project.mjs` 把它写进 `project.pbxproj` 的三处(FileReference / BuildFile / Resources phase),幂等,id 是固定的(随机 id 跑两次会加出重复条目,而 Xcode 不会警告)。流水线里还有一步 `grep` 复查,构建之前就断言它在。

### 两条流水线

- **`.github/workflows/app-ios.yml`** —— GitHub 的 **macOS runner** 上编译、签名、传 TestFlight。**这就是"不用买 Mac"的答案**:唯一真的只能在 macOS 上做的事(编译签名 iOS 应用)在这里做,租云 Mac 每月几百块,这个只花 runner 分钟数。**手动触发,不跟着 push 跑** —— 每次都会消耗一个 TestFlight 构建号,而且 macOS 分钟数按 Linux 的十倍计费,构建是一个决定,不该是打字的副作用。文件开头列了 7 个 Secret 和拿到它们的完整步骤。
- **`.github/workflows/app-android.yml`** —— Linux,便宜。出两样东西:**APK**(直接装到手机上就能跑,截图和自测用,不需要任何 Secret)和 **AAB**(Google Play 要的,需要上传密钥)。

**Google Play 是 25 美元一次性,Apple 是 99 美元一年** —— 想先上线的话,安卓那条路短得多。

### 还卡着的只有账号

上架资料(名称、描述、关键词、隐私问卷逐项答案、年龄分级、给审核员的备注)全部写在 `docs/APP_STORE.md`,是可以直接往表单里粘的成品。**图标做好了,隐私清单在构建里,流水线就位了 —— 剩下的是去注册 Apple 开发者账号,审核 1–3 天,其他所有事都能和它并行。**

---

## ⚠️ App 满屏(2026-08)—— 黑边不在网页里,在原生窗口里

`docs/HANDOVER.md` §1 记的那条黑边,查了十次都在查 CSS。**网页那一半其实早就对了**:
`tools/sky-feedback-test.mjs` 里"每一层都溢出屏幕两端"的断言一直是绿的,因为网页从来没有
错——错的是**网页被放进去的那个原生窗口**。WebView 被摆在状态栏和导航栏**之间**,两头各
剩一条窗口底色,任何 CSS 都够不着那里。

Capacitor 的脚手架默认就是错的,两个平台各错一处:

| 平台 | 脚手架默认 | 后果 | 现在 |
|---|---|---|---|
| iOS | `contentInset: "always"` | WKWebView 按安全区把内容内缩,上下各留一条 | `"never"` |
| Android | 主题不透明 + `decorFitsSystemWindows` 为真 | 网页被夹在两根系统栏之间 | 见下面三条 |

### Android 要三条同时成立,少一条黑边就回来

1. **`styles.xml`**:`statusBarColor` / `navigationBarColor` 透明,`windowDrawsSystemBarBackgrounds` 为真。
   —— 单有这条,只是把系统栏的颜色换成了窗口底色,边还在。
2. **`MainActivity.onCreate`**:`WindowCompat.setDecorFitsSystemWindows(getWindow(), false)`。
   —— 这条才真正让 WebView **画到系统栏底下**,而不是它们中间。
3. **`values-v27/styles.xml`**:`windowLayoutInDisplayCutoutMode = shortEdges`。
   —— 少这条,有刘海的机器会把窗口整个压到刘海下面,还是那条黑边,只是换到了顶上。

`androidx.core:core` 在 `app/build.gradle` 里**显式**写了一行:`WindowCompat` 是靠传递依赖进来的,
只在 runtime classpath 上,不写这行编译不过。

### 还有一条:四个面必须同色

能在 WebView 之前或背后露出来的面有四个 —— `<html>` 画的画布、iOS 窗口底色、Android 窗口
底色、启动图背景。**任何一个和别人不一样,那个不一样本身就是一条可见的边**,症状和布局
错完全一样。现在四个都是 `#05060f`,由 `tools/app-fullscreen-test.mjs` 断言。

### 怎么验

```bash
node tools/app-fullscreen-test.mjs
```
不需要模拟器、不需要设备、不需要构建 —— 上面每一条都是配置文件里的一行,谁都可能顺手
"整理"掉,而下一次发现要等一张手机截图。所以按文本断死。

