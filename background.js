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

    // 1. douban: 从页面已有链接中提取
    for (let link of message.ebooks) {
      if (link.startsWith(doubanPrefix)) {
        result.douban = link;
        break;
      }
    }

    // 并行处理 weread 和 zlibrary 探活
    let wereadDone = false;
    let zlibDone = false;

    function tryFinish() {
      if (!wereadDone || !zlibDone) return;

      // anna: 按 ISBN 构造搜索链接
      let annaDomain = ANNA_DOMAINS[0];
      if (message.isbn) {
        result.anna = `https://${annaDomain}/search?q=${encodeURIComponent(message.isbn)}`;
      } else {
        result.anna = `https://${annaDomain}/search?q=${encodeURIComponent(message.title)}`;
      }

      // 过滤用户关闭的平台
      chrome.storage.sync.get(preferencesKey, item => {
        let settings = item[preferencesKey] ?? {};
        for (let [vendor, checked] of Object.entries(settings)) {
          if (!checked) {
            delete result[vendor];
          }
        }
        chrome.tabs.sendMessage(tabId, result);
      });
    }

    // 2. weread: 抓取搜索页 HTML，提取直链 reader URL
    let keyword = message.title;
    let wereadSearchUrl = `https://weread.qq.com/web/search/books?keyword=${encodeURIComponent(keyword)}`;
    fetch(wereadSearchUrl)
      .then(resp => resp.text())
      .then(html => {
        // 提取去重后的 reader URL（按页面顺序）
        let readerUrls = [];
        let seenUrls = {};
        let urlRegex = /\/web\/reader\/[a-f0-9]+/g;
        let urlMatch;
        while ((urlMatch = urlRegex.exec(html)) !== null) {
          if (!seenUrls[urlMatch[0]]) {
            seenUrls[urlMatch[0]] = true;
            readerUrls.push(urlMatch[0]);
          }
        }
        if (readerUrls.length === 0) return;

        // 解析 __INITIAL_STATE__ 获取书籍信息，精确匹配标题
        try {
          let stateMatch = html.match(/__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/);
          if (stateMatch) {
            let state = JSON.parse(stateMatch[1]);
            let bookInfos = (state.searchBooksStoreModule || {}).bookInfos || [];
            let bestIdx = findBestMatchIdx(bookInfos, message);
            if (bestIdx >= 0 && bestIdx < readerUrls.length) {
              result.weread = `https://weread.qq.com${readerUrls[bestIdx]}`;
              return;
            }
          }
        } catch (e) {}

        // 兜底：使用第一个 reader URL（搜索结果按相关度排序）
        result.weread = `https://weread.qq.com${readerUrls[0]}`;
      })
      .catch(() => {})
      .finally(() => {
        wereadDone = true;
        tryFinish();
      });

    // 3. zlibrary: 探活获取可用域名，三层降级搜索
    getZlibDomain().then(domain => {
      if (domain) {
        result.zlibrary = buildZlibSearchUrl(domain, message);
      }
    }).catch(() => {}).finally(() => {
      zlibDone = true;
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

function findBestMatchIdx(bookInfos, message) {
  // 优先按标题精确匹配
  for (let i = 0; i < bookInfos.length; i++) {
    let info = (bookInfos[i] || {}).bookInfo;
    if (!info) continue;
    let titleClean = (info.title || "").replace(/\s/g, "");
    let msgTitleClean = (message.title || "").replace(/\s/g, "");
    if (titleClean === msgTitleClean) {
      return i;
    }
  }
  // 无精确匹配，返回第一个结果
  return bookInfos.length > 0 ? 0 : -1;
}
