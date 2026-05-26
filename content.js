const nonAsciiChecker = str => [...str].some(char => char.charCodeAt(0) > 127);
const isCJK = str => /[一-鿿㐀-䶿豈-﫿]/.test(str);

const imgSizes = {
  "weread": [117, 32],
  "douban": [99, 32],
  "zlibrary": [126, 32],
  "anna": [200, 32],
  "nobook": [150, 32],
};

let getValue = (item) => {
  return item.split(":")[1].trim();
};

let parseNames = (names) => {
  return names.split("/")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => {
      let newItem = item;
      if (item.startsWith("[") || item.startsWith("【")) {
        let idx = 0;
        while (idx < item.length) {
          if (item[idx] == "]" || item[idx] == "】") {
            break;
          }
          idx++;
        }
        newItem = item.substring(idx + 1, item.length);
      }
      return newItem.trim().replace(/ /g, "");
    })
    .join(",");
}

if (window.location.href.indexOf("book.douban.com/subject/") != -1 && window.location.href.indexOf("/comments/") === -1) {
  let title = document
    .querySelectorAll("[property='v:itemreviewed']")[0]
    .textContent.trim();
  if (isCJK(title)) {
    title = title.replaceAll(" ", "").trim();
  }
  let bookInfo = document.getElementById("info").innerText.split("\n");
  let isbn, publisher, authors, subtitle, translators;
  for (let i = 0; i < bookInfo.length; i++) {
    if (bookInfo[i].trim().startsWith("ISBN:")) {
      isbn = getValue(bookInfo[i]);
    } else if (bookInfo[i].trim().startsWith("出版社:")) {
      publisher = getValue(bookInfo[i]);
    } else if (bookInfo[i].trim().startsWith("作者:")) {
      authors = getValue(bookInfo[i]);
    } else if (bookInfo[i].trim().startsWith("副标题:")) {
      subtitle = getValue(bookInfo[i]);
    } else if (bookInfo[i].trim().startsWith("译者:")) {
      translators = getValue(bookInfo[i]);
    }
  }
  authors = parseNames(authors);
  if (translators !== null && translators !== undefined) {
    translators = parseNames(translators);
  }

  let ebooksOnPage = document.getElementsByClassName("online-read-or-audio");
  let ebookLinks = [];
  for (let ebook of ebooksOnPage) {
    let link = ebook.getElementsByTagName("a").item(0).getAttribute("href");
    if (link !== null) {
      ebookLinks.push(link);
    }
  }

  if (isbn !== null && title !== null && publisher !== null && authors !== null) {
    chrome.runtime.sendMessage(
      null,
      {
        isbn: isbn,
        title: title,
        subtitle: subtitle,
        publisher: publisher,
        authors: authors,
        translators: translators,
        doubanURL: window.location.href,
        ebooks: ebookLinks
      }
    );
  }
}

chrome.runtime.onMessage.addListener(
  (message, sender) => {
    let found = false;
    if (message.hasOwnProperty("weread")) {
      showLink("weread", message.weread, "img/weread-logo.png");
      found = true;
    }
    if (message.hasOwnProperty("douban")) {
      showLink("douban", message.douban, "img/douban-logo.svg");
      found = true;
    }
    if (message.hasOwnProperty("zlibrary")) {
      showLink("zlibrary", message.zlibrary, "img/zlibrary-logo.png");
      found = true;
    }
    if (message.hasOwnProperty("anna")) {
      showLink("anna", message.anna, "img/anna-logo.svg");
      found = true;
    }
    if (!found) {
      showLink("nobook", "", "img/no-book.png");
    }
  }
);

function initDivElement() {
  let ul = document.getElementById("douban-book-plus-list");
  if (ul === null) {
    let div = document.createElement("div");
    div.id = "douban-book-plus";
    div.style.padding = "18px 16px";
    div.style.backgroundColor = "#F6F6F2";
    div.style.margin = "20px auto";

    let componentTitle = document.createElement("h2");
    componentTitle.innerHTML = `
    <span>在线阅读</span>
      &nbsp;·&nbsp;·&nbsp;·&nbsp;·&nbsp;·&nbsp;·&nbsp;
    `;
    componentTitle.style.fontSize = "15px";
    div.append(componentTitle);
    ul = document.createElement("ul");
    ul.id = "douban-book-plus-list";
    div.append(ul);

    let footer = document.createElement("p");
    footer.style = "text-align: center; color: grey;";
    footer.innerHTML = `Powered by <a href="https://doubanbook.plus/" target="_blank">Douban Book+</a>`;
    div.append(footer);

    let element = document.getElementsByClassName("aside");
    element.item(0).insertBefore(div, element.item(0).firstChild);
  }
  return ul;
}

function showLink(name, url, imgUrl) {
  if (url) {
    let ul = initDivElement();
    let li = document.createElement("li");
    li.style.borderBottom = "1px solid rgba(0,0,0,0.08)";
    li.style.margin = "10px auto";
    let a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.style.backgroundColor = "transparent";
    let img = new Image();
    if (imgUrl.startsWith("http")) {
      img.src = imgUrl;
    } else {
      img.src = chrome.runtime.getURL(imgUrl);
    }
    [img.width, img.height] = imgSizes[name];
    a.append(img);
    li.append(a);
    ul.append(li);
  } else if (name == "nobook") {
    let ul = initDivElement();
    let li = document.createElement("li");
    li.style.borderBottom = "1px solid rgba(0,0,0,0.08)";
    li.style.margin = "10px auto";
    let img = new Image();
    if (imgUrl.startsWith("http")) {
      img.src = imgUrl;
    } else {
      img.src = chrome.runtime.getURL(imgUrl);
    }
    img.style = "display: block; margin-left: auto; margin-right: auto;";
    [img.width, img.height] = imgSizes[name];
    li.append(img);
    ul.append(li);
  }
}
