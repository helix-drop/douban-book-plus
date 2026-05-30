import { preferencesKey } from "./common.js";

const ANNA_DOMAINS = ["annas-archive.gl", "annas-archive.pk", "annas-archive.gd"];

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

const ZLIB_STORAGE_KEY = "zlib-available-domain";
const ZLIB_DOMAINS_KEY = "zlib-all-domains";
const ZLIB_LAST_UPDATE_KEY = "zlib-last-update";

const doubanPrefix = "https://read.douban.com/reader/ebook";

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    const tabId = sender.tab.id;

    let result = {};
    let errors = {};  // 记录各平台连接错误

    // 1. douban: 从页面已有链接中提取
    for (let link of message.ebooks) {
      if (link.startsWith(doubanPrefix)) {
        result.douban = link;
        break;
      }
    }

    // 并行处理 weread、zlibrary、anna
    let wereadDone = false;
    let zlibDone = false;
    let annaDone = false;

    function tryFinish() {
      if (!wereadDone || !zlibDone || !annaDone) return;

      // 附带错误信息
      if (Object.keys(errors).length > 0) {
        result.errors = errors;
      }

      // 过滤用户关闭的平台
      chrome.storage.sync.get(preferencesKey, item => {
        let settings = item[preferencesKey] ?? {};
        for (let [vendor, checked] of Object.entries(settings)) {
          if (!checked) {
            delete result[vendor];
            if (result.errors) delete result.errors[vendor];
          }
        }
        chrome.tabs.sendMessage(tabId, result);
      });
    }

    // 2. weread: 抓取搜索页，解析书目，按标题匹配后由 bookId 推导 reader 直链
    let keyword = message.title;
    let wereadSearchUrl = `https://weread.qq.com/web/search/books?keyword=${encodeURIComponent(keyword)}`;
    fetch(wereadSearchUrl)
      .then(resp => resp.text())
      .then(html => {
        try {
          // 从 __INITIAL_STATE__ 取书目，挑出确属同一本书的结果
          let stateMatch = html.match(/__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
          if (!stateMatch) return;
          let state = JSON.parse(stateMatch[1]);
          let bookInfos = (state.searchBooksStoreModule || {}).bookInfos || [];
          let match = findWereadMatch(bookInfos, message);
          if (!match || !match.bookId) return;  // 无可信匹配 → 不给链接，胜过给错链接
          // reader URL 由 bookId 确定性推导：页面渲染顺序不可靠，缺链的书也能命中
          result.weread = `https://weread.qq.com/web/reader/${transformWereadBookId(match.bookId)}`;
        } catch (e) {
          // 解析失败按“未找到”处理，不误报为连接失败
        }
      })
      .catch(() => {
        errors.weread = true;  // 网络错误 → 连接失败
      })
      .finally(() => {
        wereadDone = true;
        tryFinish();
      });

    // 3. zlibrary: 探活获取可用域名，三层降级搜索
    getZlibDomain().then(domain => {
      if (domain) {
        result.zlibrary = buildZlibSearchUrl(domain, message);
      } else {
        errors.zlibrary = true;  // 所有域名均不可达
      }
    }).catch(() => {
      errors.zlibrary = true;
    }).finally(() => {
      zlibDone = true;
      tryFinish();
    });

    // 4. anna: 探活可用域名，构造搜索链接
    getAnnaDomain().then(domain => {
      if (domain) {
        let q = message.isbn || message.title;
        result.anna = `https://${domain}/search?q=${encodeURIComponent(q)}`;
      } else {
        errors.anna = true;  // 所有域名均不可达
      }
    }).catch(() => {
      errors.anna = true;
    }).finally(() => {
      annaDone = true;
      tryFinish();
    });
  }
);

// === Z-Library 域名探活 ===

async function getZlibDomain() {
  // 优先使用缓存的可用域名
  let stored = await chrome.storage.local.get(ZLIB_STORAGE_KEY);
  let lastDomain = stored[ZLIB_STORAGE_KEY];

  if (lastDomain) {
    let ok = await checkZlibDomain(lastDomain);
    if (ok) {
      updateZlibDomainList(lastDomain);
      return lastDomain;
    }
  }

  // 缓存失效，遍历所有域名
  let allDomains = await getAllZlibDomains();
  for (let domain of allDomains) {
    if (domain === lastDomain) continue;
    let ok = await checkZlibDomain(domain);
    if (ok) {
      await chrome.storage.local.set({ [ZLIB_STORAGE_KEY]: domain });
      updateZlibDomainList(domain);
      return domain;
    }
  }
  return null;
}

async function checkZlibDomain(domain) {
  try {
    let resp = await fetch(domain + "/eapi/info/ok", { signal: AbortSignal.timeout(10000) });
    return resp.ok && (await resp.text()).length > 0;
  } catch {
    return false;
  }
}

async function getAllZlibDomains() {
  let stored = await chrome.storage.local.get(ZLIB_DOMAINS_KEY);
  let list = stored[ZLIB_DOMAINS_KEY];
  if (Array.isArray(list) && list.length > 0) {
    // 合并静态列表中可能缺少的域名
    for (let d of ZLIB_STATIC_DOMAINS) {
      if (!list.includes(d)) list.push(d);
    }
    return list;
  }
  return [...ZLIB_STATIC_DOMAINS];
}

async function updateZlibDomainList(availableDomain) {
  // 每天最多更新一次
  let stored = await chrome.storage.local.get(ZLIB_LAST_UPDATE_KEY);
  let lastUpdate = stored[ZLIB_LAST_UPDATE_KEY] || 0;
  let now = Math.ceil(Date.now() / 1000);
  if (now - lastUpdate < 86400) return;

  try {
    let resp = await fetch(availableDomain + "/eapi/info/domains", { signal: AbortSignal.timeout(7000) });
    let data = await resp.json();
    if (data && data.domains) {
      let list = [...ZLIB_STATIC_DOMAINS];
      for (let row of data.domains) {
        if (row && row.domain) {
          let url = "https://" + row.domain;
          if (!list.includes(url)) list.push(url);
        }
      }
      await chrome.storage.local.set({
        [ZLIB_DOMAINS_KEY]: list,
        [ZLIB_LAST_UPDATE_KEY]: now
      });
    }
  } catch {}
}

// === Anna's Archive 域名探活 ===

async function getAnnaDomain() {
  for (let domain of ANNA_DOMAINS) {
    try {
      let resp = await fetch(`https://${domain}/`, {
        method: "HEAD",
        signal: AbortSignal.timeout(8000)
      });
      // 任何响应（包括重定向、403）都说明域名可达
      return domain;
    } catch {}
  }
  return null;
}

// === Z-Library 三层降级搜索 URL ===

function buildZlibSearchUrl(domain, message) {
  // 优先 ISBN
  if (message.isbn) {
    return domain + "/s/" + encodeURIComponent(message.isbn);
  }
  // 其次 书名+作者
  if (message.title && message.authors) {
    return domain + "/s/" + encodeURIComponent(message.title + " " + message.authors);
  }
  // 兜底 仅书名
  return domain + "/s/" + encodeURIComponent(message.title);
}

// === 微信读书匹配 ===

// 归一化：去空白、去常见标点、转小写，便于跨标点/空格比较书名
function normalizeText(s) {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[·•・,，.。:：;；!！?？'"'""\-—–_~()（）\[\]【】《》〈〉「」、/\\|]/g, "");
}

// 豆瓣条目可能把书名拆成「标题 + 副标题」，逐一与微信读书书名比对
function titleVariants(message) {
  let t = normalizeText(message.title);
  let s = normalizeText(message.subtitle);
  let v = [];
  if (t) v.push(t);
  if (s) v.push(s);
  if (t && s) v.push(t + s);
  return v;
}

// 仅在确有把握时返回匹配的 bookInfo，否则返回 null（宁可不给链接也不给错链接）
function findWereadMatch(bookInfos, message) {
  let candidates = [];
  for (let b of bookInfos) {
    let info = (b || {}).bookInfo;
    if (info && info.bookId) candidates.push(info);
  }
  if (candidates.length === 0) return null;

  let variants = titleVariants(message);
  if (variants.length === 0) return null;

  // 第一档：归一化后书名与豆瓣某一标题变体完全一致
  for (let info of candidates) {
    let wTitle = normalizeText(info.title);
    if (wTitle && variants.includes(wTitle)) return info;
  }

  // 第二档：一方书名包含另一方，且较短一方足够具体（≥4 字符），容纳副标题/版本差异
  for (let info of candidates) {
    let wTitle = normalizeText(info.title);
    if (!wTitle) continue;
    for (let v of variants) {
      let longer = wTitle.length >= v.length ? wTitle : v;
      let shorter = wTitle.length >= v.length ? v : wTitle;
      if (shorter.length >= 4 && longer.includes(shorter)) return info;
    }
  }

  // 无可信匹配（如外文原版书名与中译本对不上）→ 不给链接
  return null;
}

// 由 bookId 推导 reader 直链 hash。WeRead 的算法依赖 MD5，故内置一份实现。
function transformWereadBookId(bookId) {
  let idStr = String(bookId);
  let h = md5(idStr);
  let result = h.substring(0, 3);
  let parts;
  if (/^\d+$/.test(idStr)) {
    // 纯数字 ID：每 9 位一段转十六进制
    let chunks = [];
    for (let i = 0; i < idStr.length; i += 9) {
      chunks.push(parseInt(idStr.slice(i, i + 9), 10).toString(16));
    }
    parts = ["3", chunks];
  } else {
    let hex = "";
    for (let i = 0; i < idStr.length; i++) hex += idStr.charCodeAt(i).toString(16);
    parts = ["4", [hex]];
  }
  result += parts[0];
  result += "2" + h.substring(h.length - 2);
  for (let i = 0; i < parts[1].length; i++) {
    let sub = parts[1][i];
    let lenHex = sub.length.toString(16);
    if (lenHex.length === 1) lenHex = "0" + lenHex;
    result += lenHex + sub;
    if (i < parts[1].length - 1) result += "g";  // 多段之间以 g 分隔（非十六进制字符）
  }
  if (result.length < 20) result += h.substring(0, 20 - result.length);
  result += md5(result).substring(0, 3);
  return result;
}

// 纯 JS MD5（WebCrypto 不提供 MD5）。返回 32 位十六进制摘要。
function md5(str) {
  function rl(x, c) { return (x << c) | (x >>> (32 - c)); }
  function add(a, b) { return (a + b) & 0xffffffff; }

  let bytes = new TextEncoder().encode(str);
  let lenBits = bytes.length * 8;
  let msg = Array.from(bytes);
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  for (let i = 0; i < 8; i++) msg.push(i < 4 ? (lenBits >>> (8 * i)) & 0xff : 0);

  let K = [];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) & 0xffffffff;
  let S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
           5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
           4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
           6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

  for (let off = 0; off < msg.length; off += 64) {
    let M = [];
    for (let i = 0; i < 16; i++) {
      M[i] = msg[off + i * 4] | (msg[off + i * 4 + 1] << 8) |
             (msg[off + i * 4 + 2] << 16) | (msg[off + i * 4 + 3] << 24);
    }
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i++) {
      let F, g;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      F = add(add(add(F, A), K[i]), M[g]);
      A = D; D = C; C = B;
      B = add(B, rl(F, S[i]));
    }
    a0 = add(a0, A); b0 = add(b0, B); c0 = add(c0, C); d0 = add(d0, D);
  }

  function hex(n) {
    let s = "";
    for (let i = 0; i < 4; i++) s += ((n >>> (8 * i)) & 0xff).toString(16).padStart(2, "0");
    return s;
  }
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}
