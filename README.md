# 约球投票 · GitHub Pages 独立版

这是一个完全不依赖 WorkBuddy 发布平台的版本：网页托管在 GitHub Pages，数据存放在你自己的 Firebase Firestore 项目。群友只需要打开链接，不需要登录任何工具；你关机、长期不登录 WorkBuddy 都不影响使用。

## 与旧版的区别

| | 旧版（WorkBuddy 链接） | 本版（GitHub Pages） |
|---|---|---|
| 网页托管 | WorkBuddy 应用域名 | `guestofsunny.github.io` |
| 数据存放 | WorkBuddy 云数据库 | 你自己的 Firebase Firestore |
| 访问限制 | 只允许 WorkBuddy 域名读写 | 任意域名均可（Firestore REST） |
| 是否依赖登录 | 依赖 WorkBuddy 应用保持发布 | 不依赖任何登录状态 |

## 一次性配置

### 1. 创建 Firebase 项目

1. 用你的 Google 账号登录 [Firebase 控制台](https://console.firebase.google.com/)，创建一个项目（免费 Spark 方案即可）。
2. 在「项目设置 → 您的应用」中添加 Web 应用，复制 **项目 ID** 和 **Web API 密钥**。
3. 在左侧「构建 → Firestore Database」创建数据库（原生模式即可）。

### 2. 填写配置

编辑本目录的 `config.js`：

```js
window.APP_CONFIG = {
  projectId: '你的项目ID',
  apiKey: '你的Web API密钥'
};
```

### 3. 设置 Firestore 规则

在 Firestore →「规则」中粘贴并发布：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{collection}/{doc} {
      allow read, write: if collection in ['wb_voters', 'wb_votes', 'wb_venues', 'wb_meta', 'wb_history'];
    }
  }
}
```

这是给微信群公开投票用的，拿到链接的人都可以读写这 5 个集合。Web API Key 本来就会出现在浏览器里，可以随页面公开。

### 4. 导入现有数据（可选）

`backup/latest.json` 是从旧版云数据库导出的当前数据。如果你希望延续原有报名、场地和历史记录，在本目录运行：

```bash
python scripts/import_to_firestore.py
```

脚本会按 `config.js` 的配置把数据写入 Firestore。跳过这一步也可以直接使用，页面会从空数据开始。

### 5. 发布

把本目录的文件推送到 GitHub 仓库 `guestofsunny/badminton-vote` 的 `main` 分支，仓库已开启 Pages，访问地址为：

https://guestofsunny.github.io/badminton-vote/

把新链接发到微信群即可。旧的 WorkBuddy 链接可以继续保留，两边数据互不相通。

## 长期可用性说明

- **GitHub Pages**：公共仓库免费，只要仓库存在就一直在线；没有「不登录就失效」的机制。
- **Firebase Spark 免费方案**：不会因长期不活动暂停项目（这一点与 Supabase 免费方案不同）；群友的读写请求会一直有效。
- **你的 Google / GitHub 账号**：只需要保持账号本身存在，平时不需要登录或做任何维护。
- **高德地图 Key**：地图搜索依赖高德 JS API Key 和其域名白名单，需确保 `guestofsunny.github.io` 已加入白名单，且 Key 未被停用。

## 文件说明

- `index.html` — 单页应用，功能与旧版一致（报名、替人报名、地图选点、人工成局、历史成局）
- `firestore-client.js` — Firestore REST 数据层，模拟旧版 `cloud.database` 的链接口
- `config.js` — Firebase 连接参数
- `backup/latest.json` — 迁移前的云端数据快照
- `scripts/import_to_firestore.py` — 一次性数据导入脚本
