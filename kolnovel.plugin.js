// Optimized Harbor eBook plugin for KolNovel
const BASE = "https://kolnovel.com";

async function getDoc(path) {
  const targetUrl = path.startsWith("http") ? path : (BASE + (path.startsWith("/") ? path : "/" + path));
  const res = await harbor.http(targetUrl, {
    responseType: "text",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept-Encoding": "gzip, deflate",
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

function cardToSummary(el) {
  const link = el.querySelector(".bsx a, a.tip, .series-title a, a");
  if (!link) return null;

  const rawTitle = (link.attr("title") || el.querySelector(".tt, .title")?.text() || link.text() || "").trim();
  const href = link.attr("href") || "";
  
  const match = href.match(/\/series\/([^\/]+)\/?/) || href.match(/\/([^\/]+)\/?$/);
  if (!match) return null;

  const img = el.querySelector("img");
  const cover = img?.attr("data-src") || img?.attr("data-lazy-src") || img?.attr("src");

  return {
    id: match[1],
    title: rawTitle.replace(/\s+(?:kol|كول|رواية)$/iu, "").trim(),
    cover: abs(cover)
  };
}

const plugin = {
  id: "kolnovel-source",
  name: "KolNovel",

  async popular(offset) {
    const page = Math.floor(offset / 20) + 1;
    const doc = await getDoc(page === 1 ? `/series/?order=popular` : `/series/page/${page}/?order=popular`);
    return doc.querySelectorAll(".listupd article.bs, .listupd .bsx").map(cardToSummary).filter(Boolean);
  },

  async search(query, offset) {
    const page = Math.floor(offset / 20) + 1;
    const doc = await getDoc(page === 1 ? `/?s=${encodeURIComponent(query)}` : `/page/${page}/?s=${encodeURIComponent(query)}`);
    return doc.querySelectorAll(".listupd article.bs, .listupd .bsx, .search-item").map(cardToSummary).filter(Boolean);
  },

  async detail(id) {
    const doc = await getDoc(`/series/${id}/`);
    const title = doc.querySelector("h1.entry-title, h1")?.text() || id;
    const img = doc.querySelector(".thumb img, .series-thumb img");
    const desc = doc.querySelector(".entry-content, .series-synops, .summary")?.text()?.trim();
    const author = doc.querySelector(".author, .spe span")?.text()?.replace(/المؤلف\s*:/i, "")?.trim();

    return {
      id,
      title: title.replace(/\s+(?:kol|كول|رواية)$/iu, "").trim(),
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
      
      // الترتيب السريع المباشر (تصاعدي للقراءة) دون استدعاء reverse()
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

if (typeof harbor !== "undefined" && harbor.register) {
  harbor.register(plugin);
}