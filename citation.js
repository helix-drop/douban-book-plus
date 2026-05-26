// 引用导出模块 - 参考 Google Scholar 引用弹窗风格
// 复制时写入 text/html + text/plain 双格式，粘贴到 Word 保留斜体

(function () {
  "use strict";

  const nonAsciiChecker = (str) =>
    [...str].some((char) => char.charCodeAt(0) > 127);

  // 检测是否包含 CJK 汉字（中日韩统一表意文字）
  const isCJK = (str) =>
    /[一-鿿㐀-䶿豈-﫿]/.test(str);

  // === 解析豆瓣页面书籍信息 ===

  function parseBookInfo() {
    let title = document
      .querySelectorAll("[property='v:itemreviewed']")[0]
      ?.textContent.trim();
    if (!title) return null;

    let bookInfo = document.getElementById("info")?.innerText.split("\n") || [];
    let info = { title: title };

    for (let line of bookInfo) {
      let trimmed = line.trim();
      if (trimmed.startsWith("ISBN:")) info.isbn = getVal(trimmed);
      else if (trimmed.startsWith("出版社:")) info.publisher = getVal(trimmed);
      else if (trimmed.startsWith("作者:") || trimmed.startsWith("作者"))
        info.authorsRaw = getVal(trimmed);
      else if (trimmed.startsWith("副标题:")) info.subtitle = getVal(trimmed);
      else if (trimmed.startsWith("译者:")) info.translatorsRaw = getVal(trimmed);
      else if (trimmed.startsWith("出版年:")) info.yearRaw = getVal(trimmed);
      else if (trimmed.startsWith("原作名:")) info.originalTitle = getVal(trimmed);
      else if (trimmed.startsWith("页数:")) info.pages = getVal(trimmed);
    }

    info.authors = parseNameList(info.authorsRaw || "");
    info.translators = info.translatorsRaw
      ? parseNameList(info.translatorsRaw)
      : [];
    info.year = extractYear(info.yearRaw || "");
    info.isChinese = isCJK(title);
    info.fullTitle = info.subtitle
      ? info.title + "：" + info.subtitle
      : info.title;

    return info;
  }

  function getVal(line) {
    let idx = line.indexOf(":");
    return idx >= 0 ? line.substring(idx + 1).trim() : line.trim();
  }

  function extractYear(raw) {
    let match = raw.match(/(\d{4})/);
    return match ? match[1] : "";
  }

  function parseNameList(raw) {
    return raw
      .split(/[/／,，、]/)
      .map((n) => n.trim())
      .filter((n) => n.length > 0)
      .map((n) => {
        let cleaned = n.replace(/[\[【].*?[\]】]/g, "").trim();
        if (nonAsciiChecker(cleaned)) {
          cleaned = cleaned.replace(/\s+/g, "");
        }
        return cleaned;
      })
      .filter((n) => n.length > 0);
  }

  // === 引用格式生成器 ===
  // 每个返回 { text, html }
  // text = 纯文本（给纯文本编辑器）
  // html = 带 <i> 标签（给 Word）

  // --- 中文格式（不需要斜体）---

  function formatGBT7714(info) {
    let authors = info.authors.join(", ");
    let s = `${authors}. ${info.fullTitle}[M]. `;
    if (info.translators.length > 0) {
      s += `${info.translators.join(", ")}, 译. `;
    }
    s += `${info.publisher || ""}, ${info.year}.`;
    return { text: s, html: esc(s) };
  }

  function formatSociety(info) {
    let authors = info.authors.join("、");
    let s = `${authors}．${info.year}．${info.fullTitle}［M］．`;
    if (info.translators.length > 0) {
      s += `${info.translators.join("、")}，译．`;
    }
    s += `${info.publisher || ""}．`;
    return { text: s, html: esc(s) };
  }

  function formatSociologicalReview(info) {
    let authors = info.authors.join("、");
    let s = `${authors}，${info.year}，《${info.fullTitle}》`;
    if (info.translators.length > 0) {
      s += `，${info.translators.join("、")}译`;
    }
    s += `，${info.publisher || ""}。`;
    return { text: s, html: esc(s) };
  }

  // --- 英文格式（书名需要斜体）---

  function formatAPA(info) {
    let authors = formatEnAuthors(info.authors, "apa");
    let title = info.originalTitle || info.fullTitle;
    let text = `${authors} (${info.year}). ${title}. ${info.publisher || ""}.`;
    let html = `${esc(authors)} (${esc(info.year)}). <span style="font-style:italic">${esc(title)}</span>. ${esc(info.publisher || "")}.`;
    return { text, html };
  }

  function formatMLA(info) {
    let authors = formatEnAuthors(info.authors, "mla");
    let title = info.originalTitle || info.fullTitle;
    let text = `${authors}. ${title}. ${info.publisher || ""}, ${info.year}.`;
    let html = `${esc(authors)}. <span style="font-style:italic">${esc(title)}</span>. ${esc(info.publisher || "")}, ${esc(info.year)}.`;
    return { text, html };
  }

  function formatChicago(info) {
    let authors = formatEnAuthors(info.authors, "chicago");
    let title = info.originalTitle || info.fullTitle;
    let text = `${authors}. ${title}. ${info.publisher || ""}, ${info.year}.`;
    let html = `${esc(authors)}. <span style="font-style:italic">${esc(title)}</span>. ${esc(info.publisher || "")}, ${esc(info.year)}.`;
    return { text, html };
  }

  function formatBibTeX(info) {
    let key =
      (info.authors[0] || "unknown").replace(/[^a-zA-Z一-鿿]/g, "") +
      info.year;
    let title = info.originalTitle || info.fullTitle;
    let authors = info.authors.join(" and ");
    let s = `@book{${key},\n`;
    s += `  title     = {${title}},\n`;
    s += `  author    = {${authors}},\n`;
    s += `  year      = {${info.year}},\n`;
    s += `  publisher = {${info.publisher || ""}},\n`;
    if (info.isbn) s += `  isbn      = {${info.isbn}},\n`;
    if (info.translators.length > 0)
      s += `  translator = {${info.translators.join(" and ")}},\n`;
    s += `}`;
    return { text: s, html: `<pre style="margin:0">${esc(s)}</pre>` };
  }

  // HTML 转义
  function esc(s) {
    let d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function formatEnAuthors(authors, style) {
    if (authors.length === 0) return "";
    if (authors.length === 1) return authors[0];
    if (style === "apa") {
      if (authors.length === 2) return `${authors[0]}, & ${authors[1]}`;
      return `${authors[0]}, ${authors.slice(1, -1).join(", ")}, & ${authors[authors.length - 1]}`;
    }
    if (style === "mla") {
      if (authors.length === 2) return `${authors[0]}, and ${authors[1]}`;
      return `${authors[0]}, et al.`;
    }
    if (authors.length <= 3)
      return `${authors.slice(0, -1).join(", ")}, and ${authors[authors.length - 1]}`;
    return `${authors[0]} et al.`;
  }

  // === 获取引用格式列表 ===

  function getCitations(info) {
    if (info.isChinese) {
      return [
        { name: "GB/T 7714-2015", ...formatGBT7714(info) },
        { name: "《社会》", ...formatSociety(info) },
        { name: "《社会学评论》", ...formatSociologicalReview(info) },
        { name: "BibTeX", ...formatBibTeX(info) },
      ];
    } else {
      return [
        { name: "APA", ...formatAPA(info) },
        { name: "MLA", ...formatMLA(info) },
        { name: "Chicago", ...formatChicago(info) },
        { name: "BibTeX", ...formatBibTeX(info) },
      ];
    }
  }

  // === 富文本复制（text/html + text/plain） ===

  function copyRichText(text, html) {
    let htmlBlob = new Blob([html], { type: "text/html" });
    let textBlob = new Blob([text], { type: "text/plain" });
    return navigator.clipboard.write([
      new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      }),
    ]);
  }

  // === UI: Google Scholar 风格弹窗 ===

  function injectStyles() {
    if (document.getElementById("dbp-citation-styles")) return;
    let style = document.createElement("style");
    style.id = "dbp-citation-styles";
    style.textContent = `
      .dbp-cite-overlay {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.5);
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .dbp-cite-modal {
        background: #fff;
        border-radius: 8px;
        width: 560px;
        max-width: 90vw;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        font-family: "Noto Sans SC", Arial, sans-serif;
      }
      .dbp-cite-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px 12px;
        border-bottom: 1px solid #e0e0e0;
      }
      .dbp-cite-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: #333;
      }
      .dbp-cite-close {
        cursor: pointer;
        font-size: 20px;
        color: #999;
        background: none;
        border: none;
        padding: 4px 8px;
        line-height: 1;
      }
      .dbp-cite-close:hover { color: #333; }
      .dbp-cite-body { padding: 8px 0; }
      .dbp-cite-item {
        padding: 12px 20px;
        border-bottom: 1px solid #f0f0f0;
        position: relative;
      }
      .dbp-cite-item:last-child { border-bottom: none; }
      .dbp-cite-item-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 6px;
      }
      .dbp-cite-label {
        font-size: 12px;
        font-weight: 600;
        color: #1a73e8;
        letter-spacing: 0.5px;
      }
      .dbp-cite-copy {
        font-size: 12px;
        color: #1a73e8;
        background: none;
        border: 1px solid #1a73e8;
        border-radius: 4px;
        padding: 2px 10px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .dbp-cite-copy:hover {
        background: #1a73e8;
        color: #fff;
      }
      .dbp-cite-copy.copied {
        background: #34a853;
        border-color: #34a853;
        color: #fff;
      }
      .dbp-cite-text {
        font-size: 13px;
        line-height: 1.6;
        color: #333;
        word-break: break-all;
        cursor: text;
        user-select: text;
        font-family: "Noto Sans SC", "Georgia", serif;
      }
      .dbp-cite-text pre {
        margin: 0;
        font-family: "SFMono-Regular", Consolas, monospace;
        font-size: 12px;
        white-space: pre-wrap;
      }
      .dbp-cite-btn {
        display: inline-block;
        margin-left: 8px;
        padding: 2px 8px;
        font-size: 12px;
        color: #1a73e8;
        background: none;
        border: 1px solid #dadce0;
        border-radius: 4px;
        cursor: pointer;
        vertical-align: middle;
      }
      .dbp-cite-btn:hover {
        background: #f1f3f4;
      }
    `;
    document.head.appendChild(style);
  }

  function showCitationModal(info) {
    injectStyles();

    let existing = document.getElementById("dbp-cite-overlay");
    if (existing) existing.remove();

    let citations = getCitations(info);

    let overlay = document.createElement("div");
    overlay.id = "dbp-cite-overlay";
    overlay.className = "dbp-cite-overlay";

    let modal = document.createElement("div");
    modal.className = "dbp-cite-modal";

    // 标题栏
    let header = document.createElement("div");
    header.className = "dbp-cite-header";
    header.innerHTML = `<h3>引用</h3>`;
    let closeBtn = document.createElement("button");
    closeBtn.className = "dbp-cite-close";
    closeBtn.textContent = "✕";
    closeBtn.onclick = () => overlay.remove();
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // 内容区
    let body = document.createElement("div");
    body.className = "dbp-cite-body";

    for (let cite of citations) {
      let item = document.createElement("div");
      item.className = "dbp-cite-item";

      let itemHeader = document.createElement("div");
      itemHeader.className = "dbp-cite-item-header";

      let label = document.createElement("span");
      label.className = "dbp-cite-label";
      label.textContent = cite.name;
      itemHeader.appendChild(label);

      let copyBtn = document.createElement("button");
      copyBtn.className = "dbp-cite-copy";
      copyBtn.textContent = "复制";
      copyBtn.onclick = () => {
        copyRichText(cite.text, cite.html).then(() => {
          copyBtn.textContent = "已复制";
          copyBtn.classList.add("copied");
          setTimeout(() => {
            copyBtn.textContent = "复制";
            copyBtn.classList.remove("copied");
          }, 1500);
        });
      };
      itemHeader.appendChild(copyBtn);
      item.appendChild(itemHeader);

      // 显示区用 innerHTML 渲染斜体
      let textDiv = document.createElement("div");
      textDiv.className = "dbp-cite-text";
      textDiv.innerHTML = cite.html;
      item.appendChild(textDiv);

      body.appendChild(item);
    }

    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    let escHandler = (e) => {
      if (e.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);
  }

  // === 注入导出按钮 ===

  function addCiteButton() {
    let info = parseBookInfo();
    if (!info) return;

    let tryInject = () => {
      let container = document.getElementById("douban-book-plus");
      if (container) {
        let h2 = container.querySelector("h2");
        if (h2 && !h2.querySelector(".dbp-cite-btn")) {
          let btn = document.createElement("button");
          btn.className = "dbp-cite-btn";
          btn.textContent = "引用";
          btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            showCitationModal(info);
          };
          h2.appendChild(btn);
        }
        return true;
      }
      return false;
    };

    if (!tryInject()) {
      let observer = new MutationObserver(() => {
        if (tryInject()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 5000);
    }
  }

  if (
    window.location.href.indexOf("book.douban.com/subject/") !== -1 &&
    window.location.href.indexOf("/comments/") === -1
  ) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", addCiteButton);
    } else {
      addCiteButton();
    }
  }
})();
