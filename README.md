# DoubanBook+Citation（本地版）

在豆瓣读书页面自动显示多个电子书平台的链接，一键跳转阅读。同时支持一键导出引用，粘贴到 Word 可保留斜体格式。

基于 [OldPanda/Douban Book+](https://github.com/OldPanda/douban-book-plus-homepage) 二次开发，移除了对外部 API 的依赖，所有搜索逻辑在插件本地完成。

## 功能截图

### 在线阅读

在豆瓣读书页面侧栏自动显示各平台链接，点击即跳转：

![在线阅读](img/screenshots/sidebar-normal.png)

| 平台 | 逻辑 |
|------|------|
| 微信读书 | 抓取 weread.qq.com 搜索页，解析 SSR 数据精确匹配标题，提取直链 |
| 豆瓣阅读 | 直接从豆瓣页面提取已有链接 |
| Z-Library | 自动探活可用域名 + 三层降级搜索 |
| Anna's Archive | 探活可用镜像域名 + 按 ISBN 构造搜索链接 |

### 连接状态提示

插件会对每个平台进行域名探活。如果平台正常响应但未收录该书，则不显示该平台；如果域名不可达（网络故障或地区限制），则显示灰色 Logo 和「无法连接」提示：

![无法连接](img/screenshots/sidebar-error.png)

> **注意：** Z-Library 和 Anna's Archive 在部分地区/网络环境下无法直接访问，这不是插件的问题。如果你始终看到「无法连接」，说明你的网络无法到达这些站点。

### 引用导出

点击「在线阅读」旁边的「引用」按钮，弹出 Google Scholar 风格的引用弹窗。根据书籍语言自动选择格式：

![引用弹窗](img/screenshots/citation.png)

**中文书籍：**
- GB/T 7714-2015
- 《社会》杂志格式
- 《社会学评论》杂志格式
- BibTeX

**外文书籍（英语、法语等）：**
- APA (7th)
- MLA (9th)
- Chicago (17th)
- BibTeX

点击「复制」按钮，剪贴板同时写入富文本和纯文本：
- 粘贴到 **Word** → 书名自动带斜体
- 粘贴到**记事本/代码编辑器** → 纯文本

## 安装方式

1. 下载 [最新 Release](https://github.com/helix-drop/douban-book-plus/releases) 并解压
2. 打开 Chrome，地址栏输入 `chrome://extensions/`
3. 右上角开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择解压后的文件夹
6. 访问任意豆瓣读书页面（如 https://book.douban.com/subject/25985021/ ），侧栏会出现「在线阅读」区域和「引用」按钮

## 自定义配置

### 网址配置

所有平台网址定义在 `background.js` 中，你可以根据需要修改：

#### Z-Library

```js
// background.js 顶部

// 静态域名列表，探活时依次尝试
const ZLIB_STATIC_DOMAINS = [
  "https://z-lib.sk",
  "https://z-library.ec",
  "https://z-library.sk",
  "https://articles.sk",
  "https://z-lib.gd",
  "https://z-lib.gl",
  "https://z-library.hn",
  "https://z-library.la",
];
```

插件会自动调用 `/eapi/info/ok` 探测哪个域名可用，并通过 `/eapi/info/domains` 每天更新域名列表。如果你知道新的可用域名，直接加到 `ZLIB_STATIC_DOMAINS` 数组中即可。

搜索采用三层降级：
1. ISBN → `域名/s/9787020024759`
2. 书名+作者 → `域名/s/红楼梦 曹雪芹`
3. 仅书名 → `域名/s/红楼梦`

#### Anna's Archive

```js
// background.js 顶部

const ANNA_DOMAINS = ["annas-archive.gl", "annas-archive.pk", "annas-archive.gd"];
```

插件启动时会依次探活列表中的域名（HEAD 请求，8 秒超时），使用第一个可达的域名构造搜索链接 `https://域名/search?q=ISBN`。所有域名均不可达时显示「无法连接」。

当前已知镜像：
- `annas-archive.gl`
- `annas-archive.pk`
- `annas-archive.gd`

如果你的网络环境下这些域名均无法访问，可以替换为你能访问的镜像地址。

#### 微信读书

```js
// background.js 中 weread 部分

let wereadSearchUrl = `https://weread.qq.com/web/search/books?keyword=${encodeURIComponent(keyword)}`;
```

插件直接抓取微信读书搜索结果页 HTML，从中解析 `__INITIAL_STATE__` SSR 数据进行标题匹配，并提取 `/web/reader/{hash}` 格式的直链。一般不需要修改。

### 引用格式配置

引用格式定义在 `citation.js` 中。如需新增或修改格式，编辑对应的格式函数：

- `formatGBT7714()` — GB/T 7714-2015
- `formatSociety()` — 《社会》
- `formatSociologicalReview()` — 《社会学评论》
- `formatAPA()` / `formatMLA()` / `formatChicago()` — 英文格式
- `formatBibTeX()` — BibTeX

每个函数返回 `{ text, html }`，其中 `html` 用于富文本复制（支持斜体），`text` 用于纯文本复制。

### 修改后生效

修改文件后：
1. 打开 `chrome://extensions/`
2. 找到 DoubanBook+Citation 插件，点击刷新按钮（圆形箭头）
3. 重新打开豆瓣读书页面即可

如果修改了网址，需要确保 `manifest.json` 的 `host_permissions` 中包含了新域名，格式为：
```json
"https://*.你的域名/*"
```

## 许可

本项目基于 OldPanda 的原始作品修改，仅供个人使用。
