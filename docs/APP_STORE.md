# 上架资料 · App Store & Google Play

这份文件是**要往表单里粘的东西**,以及**为什么这么写**。审核会读它,所以每一句都要经得起对照 —— 说了有的功能必须真的有,说了没有的必须真的没有。

代码那一侧见 `docs/APP_SHELL.md`(外壳)、`.github/workflows/app-ios.yml`(打包流水线里写了每一个前置条件)。

---

## 1. 基本信息

| 字段 | 值 |
|---|---|
| App 名称 | **Are you alright?** |
| 副标题(iOS,30 字符上限) | A sky for what you can't say |
| Bundle ID / 包名 | `com.cubewithin.areyoualright` |
| 主要类目 | Health & Fitness(健康健美) |
| 次要类目 | Lifestyle |
| 价格 | 免费 |
| App 内购买 | 无 |
| 广告 | 无 |
| 网站 | https://cubewithin.com |
| 隐私政策 | https://cubewithin.com/privacy.html |
| 支持页面 | https://cubewithin.com/about.html |

**为什么归到 Health & Fitness 而不是 Social Networking:** 这里没有关注、没有好友、没有私信、没有个人主页 —— 归到社交类会被拿社交产品的尺子量,而它的功能一条都对不上。而且分类决定审核团队用哪套标准看你,选错的代价是被按错误的规则拒。

---

## 2. 描述

### 英文(App Store / Play 通用)

```
Somewhere to put the thing you can't say out loud.

Write down what you're carrying — grief, a night that won't end, someone who
left, something you never got to say — and let it drift up into a shared night
sky. Strangers all over the world read it. Sometimes one of them writes back.

No account. No email. No followers, no likes, no feed to fall into. You choose
a name that isn't yours and that's all anyone ever knows about you.

· Write a sorrow, or make a wish
· Read what other people are carrying, one balloon at a time
· Answer a stranger, or just leave a light — a wordless "I read this"
· Have a whisper read aloud to you
· Keep the ones that stay with you

Pain is welcome here. Harm is not. Everything written is read as it's posted;
attacks, encouragement to self-harm and contact details are removed. Anyone can
report anything, and three reports take it down regardless. Whispers are
deleted a year after they're written.

This is not therapy and not a crisis service, and it doesn't pretend to be. If
you're in danger tonight, please call someone who can help: 988 in the US and
Canada, 116 123 in the UK and Ireland, 12356 in mainland China, or find your
country at findahelpline.com.
```

### 中文简体

```
一个可以放下说不出口的事的地方。

把你正扛着的东西写下来 —— 思念、过不去的夜、离开的人、没来得及说的话 —— 让它飘进一片
共享的夜空。世界各地的陌生人会读到它。有时候,其中一个会回你一句。

没有账号,不留邮箱。没有关注、没有点赞、没有刷不完的信息流。你自己起一个不是真名的名字,
别人知道的就只有这个。

· 说说心事,或者许个愿
· 一个气球一个气球地,读别人正扛着的东西
· 回一个陌生人,或者只留一盏灯 —— 一句不说话的「我读到了」
· 让一条悄悄话读给你听
· 把那些留在心里的收藏起来

痛苦可以来,伤害不可以。每一条写下来的时候就会被读一遍;攻击别人、教人伤害自己、留联系
方式都会被处理。任何人都能举报任何内容,三次举报无论如何都会下架。内容满一年会被删除。

这里不是心理咨询,也不是危机干预,我们不假装是。如果你今晚正处在真实的危险里,请联系能
帮到你的人:中国大陆 12356,美国 / 加拿大 988,英国 / 爱尔兰 116 123,其他地区见
findahelpline.com。
```

**写法上的三条约束**,不是文风,是会影响审核和留存的:
1. **危机热线写进描述里**,不只写在 App 里。审核员看的是描述;涉及自伤话题的产品,把求助资源摆在明处是最省事的过关方式,也本来就该这样。
2. **不承诺"有人会回复你"。** 会不会有人回,我们控制不了 —— 承诺了,第一个没收到回复的人就是被骗的那个。
3. **明说不是心理咨询。** 这句既是审核要的,也是免责,更是诚实。

---

## 3. 关键词(iOS,100 字符上限,逗号分隔不留空格)

```
anonymous,vent,feelings,lonely,grief,journal,confide,night,letting go,healing
```

不放 `depression`、`suicide`、`self harm` 这类词:它们会把产品推给正在搜索这些词的人,而那些人此刻需要的是热线,不是一个陌生人写字的地方。

---

## 4. 截图

**iOS 必需尺寸:** 6.9"(1320×2868)和 6.5"(1242×2688)各 3–10 张。
**Play 必需:** 手机截图至少 2 张,加一张 1024×500 的特色图。

建议这五张,按顺序:
1. **夜空**,几只气球飘着 —— 第一眼要知道这是什么
2. **写悄悄话**的界面,内容是一句真实但不极端的话
3. **读一条**,底下有一两条回信 —— 证明真的有人回
4. **我的星空**,四行折叠 —— 证明你的东西找得回来
5. **社区原则**页面 —— 审核员喜欢看到这个,用户也是

> 截图要用真机或模拟器出。这一步我这边做不了(没有 iOS 环境),但 Android 的 APK 一装就能截,iOS 可以在拿到证书跑通流水线之后从 TestFlight 装了再截。

---

## 5. 隐私问卷(App Privacy / Data safety)

**两个商店都选:不收集任何数据。** 这是实话,逐项对照过:

| 问 | 答 | 依据 |
|---|---|---|
| 联系方式(邮箱、电话、住址) | 否 | 没有账号,不问;正文里出现的联系方式会被自动打码 |
| 身份标识(用户 ID、设备 ID) | 否 | 作者身份是手机自己生成的随机串,**服务端只见到它的 SHA-256**,对不上任何人 |
| 位置 | 否 | 从不请求 |
| 通讯录 / 照片 / 相机 / 麦克风 | 否 | 从不请求 |
| 使用数据、诊断数据 | 否 | 没有统计 SDK,没有崩溃上报 |
| 用户内容 | **否** | ⚠️ 这一条容易答错:用户写的东西是**他自己发布到公开天空**的,不是我们**收集**关于他的信息。问卷问的是后者 |
| 用于追踪 | 否 | 没有广告标识符,没有第三方网络请求 |

对应的 `app/ios/App/App/PrivacyInfo.xcprivacy` 已经在 Xcode 的 Resources 里(`tools/patch-ios-project.mjs` 保证的 —— 文件放在目录里但没进构建,上传照过,审核会拒)。

---

## 6. 年龄分级

**iOS 填 17+**,不要试图往低了填。

问卷里如实勾选「Frequent/Intense Mature/Suggestive Themes」——产品的内容就是成年人的真实痛苦。填低了被抽查到,后果比一开始就填 17+ 严重得多。

**Play 填「Mature 17+」**,内容分级问卷里如实回答涉及敏感主题。

---

## 7. 审核备注(Review Notes,给审核员看的)

```
This is an anonymous public message board for emotional support. There is no
account system: an anonymous identity is generated on the device, and the
server only ever stores a hash of it. No login is required to review the app —
open it and everything is available.

Moderation, for guideline 1.2 (user-generated content):
· Every post and reply is screened by a moderation model as it is written.
· A report button is on every post and every reply.
· Three reports hide content automatically, independently of the model.
· Content that would let someone hurt themselves or another person is refused
  outright at posting time.
· Contact details are masked automatically so nobody can be pulled off-platform.
· Community rules: https://cubewithin.com/principles.html

Crisis resources (988, 116 123, 12356, findahelpline.com) are shown in the app
whenever someone writes about self-harm, and are listed on the rules page.

There is no blocking of individual users because there are no user accounts to
block — the product is anonymous by design. Reporting and automated removal are
the equivalent controls.
```

**为什么要单独写这一段:** 1.2 条(用户生成内容)是这类 App 最常见的拒因,审核员要的是「过滤 + 举报 + 屏蔽 + 联系方式」四件套。我们有三件,**第四件「屏蔽某个用户」做不到,因为根本没有用户账号可屏蔽** —— 与其等着被拒再解释,不如在备注里先说清楚为什么它不适用,以及我们用什么替代。

---

## 7b. 现在就能测(不用任何开发者账号)

账号在审核期间不用干等,两台手机都能装上真东西试。

### 安卓:装一个真的 APK,今天就能装

**Actions → `App — build Android` → Run workflow**,跑完在页面底下 Artifacts 里下 `are-you-alright-debug-apk`(zip,解开是 .apk,约 9 MB,产物存 30 天)。传到安卓手机上点开,系统会问"允许从此来源安装",允许就装上了。

- 这是 **debug 签名**,只能自己装,**不能上架**;上架要的是签过名的 AAB(同一条流水线勾 `release`,并先配好 `ANDROID_*` 四个 Secret)。
- 装上之后要验的是"网页里看不出来的那几样":图标和名字对不对、开屏、返回键(应该先关阅读页、再关发布框、再退出)、震动、状态栏颜色、有没有地址栏。
- ⚠️ **它连的是线上的 cubewithin.com**,不是本地——所以你在 App 里发的悄悄话是真的会飘到天上去的。

### iPhone:没有 Mac 就装不了原生包,但有一条几乎一样的路

先把事实说清楚:**iOS 上装 App 必须签名**,签名必须有 Mac 上的 Xcode(或 GitHub 的 macOS runner)+ 一个 Apple ID。所以:

- **有 Mac**:免费 Apple ID 就够。Xcode 打开 `app/ios/App/App.xcworkspace` → Signing & Capabilities 选 Personal Team → 插线选自己的 iPhone → Run。**限制:证书 7 天过期**,过期后重新 Run 一次即可;一个免费账号最多 3 个 App。**不需要 $99。**
- **没有 Mac**:`app-ios.yml` 那条路(GitHub 的 macOS runner)**绕不开 $99 账号**——它需要 App Store 分发证书和描述文件,那两样只有付费账号能生成。租云 Mac 也一样卡在证书上,不是卡在机器上。
- **所以没有 Mac 的时候,iPhone 上的测试办法是「添加到主屏幕」**:Safari 打开 cubewithin.com → 分享 → 添加到主屏幕。**全屏、没有地址栏、有图标、刘海和底部安全区都已经适配**(`--safe-top` / `--safe-bottom`),视觉上和 App 基本一致。
  - 差别只在原生那几样:震动走的是网页 API、没有原生返回手势、分享用的是系统分享面板而不是 Capacitor 插件。
  - ⚠️ **主屏幕那个图标有它自己独立的一份存储**,和 Safari 里不是同一个身份——这正是 `identity.js` 里写的那条(一份存储 = 一个名字)。测的时候别把这当成 bug。

### Google Play 走在前面之前,先知道这一条

个人开发者账号(2023 年 11 月之后新注册的)在能提交正式版之前,要先做 **封闭测试:至少 12 个测试者、连续 14 天**。所以"安卓更快"是相对 Apple 的 1–3 天审核而言的**账号更便宜**($25 一次性 vs $99/年),**不代表能立刻上架**。公司/组织账号不受这条限制。规则会变,提交前去 Play Console 现看一眼。

---

## 8. 顺序(哪些能并行,哪些卡着别人)

0. **不用等账号的**:跑 `App — build Android` 拿 APK 装安卓手机;iPhone 用「添加到主屏幕」。见 §7b
1. **马上去注册 Apple Developer($99/年)** —— 审核 1–3 天,**其他所有事都能和它并行,只有它不能被并行**
2. Google Play 开发者账号($25 一次性)—— 账号便宜得多,但个人号要先做满 12 人 × 14 天的封闭测试(§7b),别以为是"马上能上"
3. 拿到 Apple 账号 → 建 App Store Connect API key、注册 Bundle ID、生成证书和描述文件 → 填 `app-ios.yml` 里列的 7 个 Secret
4. 生成上传密钥(`.jks`),配好 `ANDROID_*` 四个 Secret → 跑 `App — build Android` 勾 `release` 拿签名 AAB。**这个 .jks 丢了就永远不能再更新同一个 Play 上架条目,备份好**
5. 跑一次 `App — build iOS`,进 TestFlight
6. 填上面的资料,提交

**图标已经做好了**(`public/icons/`,从 `icon.svg` 一张图生成全部尺寸),隐私清单已经在构建里,两条流水线已经就位。**卡住的只剩账号。**
