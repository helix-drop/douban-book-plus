# Douban Book+ (本地版)

在豆瓣读书页面自动显示多个电子书平台的链接，一键跳转阅读。

基于 [OldPanda/Douban Book+](https://github.com/OldPanda/douban-book-plus-homepage) 二次开发，移除了对外部 API 的依赖，所有搜索逻辑在插件本地完成。

## 支持的平台

| 平台 | 逻辑 |
|------|------|
| 微信读书 | 调用 weread.qq.com 搜索接口，按 ISBN → 标题匹配 |
| 豆瓣阅读 | 直接从豆瓣页面提取已有链接 |
| Z-Library | 自动探活可用域名 + 三层降级搜索 |
| Anna's Archive | 按 ISBN 构造搜索链接 |

## 安装方式

1. 下载 [最新 Release](https://github.com/helix-drop/douban-book-plus/releases) 并解压
2. 打开 Chrome，地址栏输入 `chrome://extensions/`
3. 右上角开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择解压后的文件夹
6. 访问任意豆瓣读书页面（如 https://book.douban.com/subject/25985021/ ），侧栏会出现「在线阅读」区域

## 自定义网址配置

所有平台网址定义在 `background.js` 中，你可以根据需要修改：

### Z-Library

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

### Anna's Archive

```js
// background.js 顶部

const ANNA_DOMAINS = ["annas-archive.gl", "annas-archive.pk", "annas-archive.gd"];
```

默认使用第一个域名。搜索链接格式为 `https://annas-archive.gl/search?q=ISBN`。如果域名失效，替换为当前可用的镜像即可。

当前已知合法镜像：
- `annas-archive.gl`
- `annas-archive.pk`
- `annas-archive.gd`

### 微信读书

```js
// background.js 中 weread 部分

let wereadUrl = `https://weread.qq.com/web/search/books?keyword=${encodeURIComponent(keyword)}`;
```

搜索接口为微信读书官方 Web API，一般不需要修改。

### 修改后生效

修改 `background.js` 后：
1. 打开 `chrome://extensions/`
2. 找到 Douban Book+ 插件，点击刷新按钮（圆形箭头）
3. 重新打开豆瓣读书页面即可

同时需要确保 `manifest.json` 的 `host_permissions` 中包含了你新增的域名，格式为：
```json
"https://*.你的域名/*"
```

## 许可

本项目基于 OldPanda 的原始作品修改，仅供个人使用。
