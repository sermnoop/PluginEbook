// Harbor eBook source plugin for KolNovel
const BASE = "https://kolnovel.com";

async function getDoc(path) {
  const targetUrl = path.startsWith("http") ? path : (BASE + (path.startsWith("/") ? path : "/" + path));
  const res = await harbor.http(targetUrl, {
    responseType: "text",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Referer": BASE + "/"
    }
  });
  if (!res.ok) throw new Error("http " + res.status + " for " + path);
  return harbor.parseHtml(res.body);
}

function abs(url) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return BASE + url;
  return BASE + "/" + url;
}

function cleanTitle(value) {
  return (value || "")
    .replace(/\s+(?:kol|كول|رواية)$/iu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cardToSummary(el) {
  const link = el.querySelector(".bsx a, a.tip, .series-title a, a");
  if (!link) return null;

  const rawTitle = (link.attr("title") || el.querySelector(".tt, .title")?.text() || link.text() || "").trim();
  const href = link.attr("href") || "";
  
  const match = href.match(/\/(?:series|novel)\/([^\/]+)\/?/) || href.match(/\/([^\/]+)\/?$/);
  if (!match) return null;

  const img = el.querySelector("img");
  const cover = img?.attr("data-src") || img?.attr("data-lazy-src") || img?.attr("src");

  return {
    id: match[1],
    title: cleanTitle(rawTitle),
    cover: abs(cover)
  };
}

const plugin = {
  id: "kolnovel-source",
  name: "KolNovel",

  async popular(offset) {
    const page = Math.floor(offset / 20) + 1;
    const path = page === 1 ? `/series/` : `/series/page/${page}/`;
    const doc = await getDoc(path);
    return doc.querySelectorAll(".listupd article, .listupd .bsx, .bs").map(cardToSummary).filter(Boolean);
  },

  async search(query, offset) {
    const page = Math.floor(offset / 20) + 1;
    const path = page === 1 ? `/?s=${encodeURIComponent(query)}` : `/page/${page}/?s=${encodeURIComponent(query)}`;
    const doc = await getDoc(path);
    return doc.querySelectorAll(".listupd article, .listupd .bsx, .search-item").map(cardToSummary).filter(Boolean);
  },

  async detail(id) {
    const doc = await getDoc(`/series/${id}/`);
    const root = doc.querySelector(".series-profile, .post-body, .main-info, article");
    if (!root) return null;

    const title = root.querySelector("h1.entry-title, h1")?.text() || id;
    const img = root.querySelector(".thumb img, .series-thumb img");
    const desc = root.querySelector(".entry-content, .series-synops, .summary")?.text()?.trim();
    const author = root.querySelector(".author, .spe span")?.text()?.replace(/المؤلف\s*:/i, "")?.trim();

    return {
      id,
      title: cleanTitle(title),
      cover: abs(img?.attr("data-src") || img?.attr("src")),
      description: desc || "",
      author: author || undefined
    };
  },

  async chapters(id) {
    const doc = await getDoc(`/series/${id}/`);
    const nodes = doc.querySelectorAll(".eplister ul li a, ul.chapter-list li a");
    const total = nodes.length;

    const chaptersList = new Array(total);
    for (let i = 0; i < total; i++) {
      const a = nodes[i];
      const href = a.attr("href") || "";
      const numNode = a.querySelector(".epl-num, .chapternum, .name");
      const title = numNode ? numNode.text().trim() : a.text().trim();

      const position = total - 1 - i;
      chaptersList[position] = {
        id: href.replace(BASE, "").replace(/^\//, ""),
        position: position,
        title: title,
        pages: 0,
        language: "ar"
      };
    }

    return chaptersList.filter(Boolean);
  },

  async content(chapterId) {
    const doc = await getDoc("/" + chapterId);
    const paragraphs = doc.querySelectorAll(".entry-content p, .epcontent p");

    const blocks = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const txt = paragraphs[i].text().trim();
      if (txt && !txt.includes("kolnovel") && !txt.includes("انضموا إلى")) {
        blocks.push(txt);
      }
    }
    return blocks.join("\n\n");
  }
};

// دعم المحركين: سواء بالتسجيل المباشر أو بإرجاع الكائن
if (typeof harbor !== "undefined" && harbor.register) {
  harbor.register(plugin);
}

return plugin;