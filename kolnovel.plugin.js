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
    .replace(/[^\p{L}\p{N}'’\s]+/gu, " ")
    .replace(/\s+(?:kol|كول|رواية)$/iu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cardToSummary(el) {
  const link = el.querySelector("a[href*='/series/'], a");
  if (!link) return null;

  const href = link.attr("href") || "";
  const match = href.match(/\/series\/([^\/]+)\/?/);
  if (!match) return null;

  const img = el.querySelector("img");
  const rawTitle = link.attr("title") || el.querySelector(".tt, .title")?.text() || link.text() || match[1];

  let cover = img?.attr("data-src") || img?.attr("data-lazy-src") || img?.attr("src");

  return {
    id: match[1],
    title: cleanTitle(rawTitle),
    cover: abs(cover),
    status: el.querySelector(".status, .epx")?.text()?.trim() || undefined
  };
}

const plugin = {
  id: "kolnovel-source",
  name: "KolNovel",

  async popular(offset) {
    const page = Math.floor(offset / 20) + 1;
    const path = page === 1 ? "/series/?order=popular" : `/series/?page=${page}&order=popular`;
    const doc = await getDoc(path);
    
    // فحص جميع الحاويات الممكنة في قالب KolNovel
    const items = doc.querySelectorAll(".listupd .bsx, .listupd article, .bsx");
    return items.map(cardToSummary).filter(Boolean);
  },

  async search(query, offset) {
    const page = Math.floor(offset / 20) + 1;
    const path = page === 1 ? `/?s=${encodeURIComponent(query)}` : `/page/${page}/?s=${encodeURIComponent(query)}`;
    const doc = await getDoc(path);
    
    const items = doc.querySelectorAll(".listupd .bsx, .listupd article, .c-tabs-item__content, .bsx");
    return items.map(cardToSummary).filter(Boolean);
  },

  async detail(id) {
    const doc = await getDoc(`/series/${id}/`);
    const root = doc.querySelector(".series-profile, .post-body, .main-info, article");
    if (!root) return null;

    const title = root.querySelector("h1.entry-title, h1")?.text() || id;
    const img = root.querySelector(".thumb img, .series-thumb img, img.wp-post-image");
    const desc = root.querySelector(".entry-content, .series-synops, .summary")?.text()?.trim();
    const author = root.querySelector(".author, .spe span")?.text()?.replace(/المؤلف\s*:/i, "")?.trim();
    const status = root.querySelector(".status")?.text()?.trim();

    return {
      id,
      title: cleanTitle(title),
      cover: abs(img?.attr("data-src") || img?.attr("src")),
      description: desc || "",
      author: author || undefined,
      status: status || undefined,
      genres: root.querySelectorAll(".genres a, .series-genres a").map(node => node.text().trim()).filter(Boolean)
    };
  },

  async chapters(id) {
    const doc = await getDoc(`/series/${id}/`);
    const nodes = doc.querySelectorAll(".eplister ul li a, ul.chapter-list li a, .cl_list ul li a");
    const total = nodes.length;

    const list = new Array(total);
    for (let i = 0; i < total; i++) {
      const a = nodes[i];
      const href = a.attr("href") || "";
      const numNode = a.querySelector(".epl-num, .chapternum, .name");
      const title = numNode ? numNode.text().trim() : a.text().trim();

      const position = total - 1 - i;
      list[position] = {
        id: href.replace(BASE, "").replace(/^\//, ""),
        position: position,
        title: title,
        pages: 0,
        language: "ar"
      };
    }

    return list.filter(Boolean);
  },

  async content(chapterId) {
    const doc = await getDoc("/" + chapterId);
    const blocks = doc.querySelectorAll(".entry-content p, .epcontent p");
    return blocks.map(n => n.text().trim()).filter(t => t && !t.includes("kolnovel")).join("\n\n");
  }
};
