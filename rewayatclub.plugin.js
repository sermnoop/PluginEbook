// Harbor eBook source plugin for Rewayat Club
// Website: https://rewayat.club
const BASE = "https://rewayat.club";

function cleanHtml(html) {
  if (!html || typeof html !== "string") return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "");
}

function safeUrl(path) {
  if (!path) return BASE;
  let full = path.startsWith("http") ? path : (BASE + (path.startsWith("/") ? path : "/" + path));
  try {
    full = decodeURI(full);
  } catch (e) {}
  return encodeURI(full);
}

async function getDoc(path) {
  const targetUrl = safeUrl(path);
  const res = await harbor.http(targetUrl, {
    responseType: "text",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "ar,en;q=0.9",
      "Referer": BASE + "/"
    }
  });
  if (!res.ok) throw new Error("http " + res.status + " for " + targetUrl);
  return harbor.parseHtml(cleanHtml(res.body));
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
    .replace(/\s+(?:رواية|rewayat|club)$/iu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cardToSummary(el) {
  // استهداف رابط العنوان مباشرة وتجنب روابط التصنيفات والوسوم
  const link = el.querySelector("h2 a, h3 a, h4 a, .entry-title a, .post-title a, .title a, a:has(img)");
  if (!link) return null;

  const href = link.attr("href") || "";
  if (!href || href === "#" || href === BASE || href === BASE + "/") return null;

  // استبعاد الصفحات الثابتة والتصنيفات
  if (/\/(category|tag|author|page|contact|about|privacy|terms)\//i.test(href)) {
    return null;
  }

  // استخراج المعرّف
  const cleanPath = href.replace(/^https?:\/\/[^\/]+\//, "").replace(/\/$/, "");
  const segments = cleanPath.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const slug = segments[segments.length - 1];
  if (!slug || slug.startsWith("wp-")) return null;

  const img = el.querySelector("img");
  const cover = img?.attr("data-src") || img?.attr("data-lazy-src") || img?.attr("src");

  let rawTitle = link.attr("title") || el.querySelector("h2, h3, h4, .entry-title, .title")?.text() || link.text() || slug;
  try {
    rawTitle = decodeURIComponent(rawTitle);
  } catch (e) {}

  return {
    id: slug,
    title: cleanTitle(rawTitle),
    cover: abs(cover)
  };
}

let cachedDoc = null;
let cachedId = null;
let cacheTime = 0;

async function getNovelDoc(id) {
  const now = Date.now();
  if (cachedDoc && cachedId === id && (now - cacheTime < 60000)) {
    return cachedDoc;
  }

  let doc = null;
  const candidates = [`/${id}/`, `/novel/${id}/`, `/series/${id}/`];
  for (const path of candidates) {
    try {
      doc = await getDoc(path);
      if (doc) break;
    } catch (e) {}
  }

  if (!doc) throw new Error("Could not load novel details for " + id);

  cachedDoc = doc;
  cachedId = id;
  cacheTime = now;
  return doc;
}

const plugin = {
  id: "rewayatclub-source",
  name: "Rewayat Club",

  async popular(offset) {
    const page = Math.floor(offset / 20) + 1;
    // الاعتماد على مسار الصفحة الرئيسية لأنه متاح دائماً دون مشاكل 404
    const path = page === 1 ? "/" : `/page/${page}/`;
    
    let doc;
    try {
      doc = await getDoc(path);
    } catch (e) {
      return [];
    }

    const items = doc.querySelectorAll("article, .post, .listupd .bsx, .page-item-detail, .entry");
    const seen = new Set();
    const results = [];

    for (let i = 0; i < items.length; i++) {
      const card = cardToSummary(items[i]);
      if (card && !seen.has(card.id)) {
        seen.add(card.id);
        results.push(card);
      }
    }

    return results;
  },

  async search(query, offset) {
    const page = Math.floor(offset / 20) + 1;
    const path = page === 1 ? `/?s=${encodeURIComponent(query)}` : `/page/${page}/?s=${encodeURIComponent(query)}`;
    
    let doc;
    try {
      doc = await getDoc(path);
    } catch (e) {
      return [];
    }

    const items = doc.querySelectorAll("article, .post, .listupd .bsx, .search-item");
    const seen = new Set();
    const results = [];

    for (let i = 0; i < items.length; i++) {
      const card = cardToSummary(items[i]);
      if (card && !seen.has(card.id)) {
        seen.add(card.id);
        results.push(card);
      }
    }

    return results;
  },

  async detail(id) {
    const doc = await getNovelDoc(id);
    let title = doc.querySelector("h1.entry-title, h1")?.text() || id;
    try {
      title = decodeURIComponent(title);
    } catch (e) {}

    const img = doc.querySelector(".thumb img, .series-thumb img, .summary_image img, img.wp-post-image");
    const desc = doc.querySelector(".entry-content, .series-synops, .summary__content, .description-summary")?.text()?.trim();
    const author = doc.querySelector(".author-content, .author, .spe span")?.text()?.replace(/المؤلف\s*:/i, "")?.trim();

    return {
      id,
      title: cleanTitle(title),
      cover: abs(img?.attr("data-src") || img?.attr("src")),
      description: desc || "",
      author: author || undefined
    };
  },

  async chapters(id) {
    const doc = await getNovelDoc(id);
    const links = doc.querySelectorAll(".eplister ul li a, .wp-manga-chapter a, ul.chapter-list li a, .cl_list li a, .chapters a");
    const total = links.length;
    if (total === 0) return [];

    const list = new Array(total);
    for (let i = 0; i < total; i++) {
      const a = links[i];
      const href = a.attr("href") || "";
      const numNode = a.querySelector(".epl-num, .chapternum");
      const titleNode = a.querySelector(".epl-title");

      let chapterTitle = "";
      if (numNode && titleNode) {
        chapterTitle = `فصل ${numNode.text().trim()} - ${titleNode.text().trim()}`;
      } else if (numNode) {
        chapterTitle = `فصل ${numNode.text().trim()}`;
      } else {
        chapterTitle = a.text().trim();
      }

      const position = total - 1 - i;
      list[position] = {
        id: href.replace(/^https?:\/\/[^\/]+/, ""),
        position: position,
        title: chapterTitle.replace(/\s+/g, " ").trim() || `فصل ${position + 1}`,
        pages: 0,
        language: "ar"
      };
    }

    return list.filter(Boolean);
  },

  async content(chapterId) {
    const doc = await getDoc(chapterId.startsWith("/") ? chapterId : "/" + chapterId);
    const container = doc.querySelector(".epcontent, .reading-content, #readerarea, .entry-content, .text-left, .post-content");
    if (!container) return "";

    const paragraphs = container.querySelectorAll("p");
    const lines = [];

    if (paragraphs && paragraphs.length > 0) {
      for (let i = 0; i < paragraphs.length; i++) {
        const text = paragraphs[i].text().trim();
        if (!text) continue;
        if (/rewayat\.club|ديسكورد|سيرفرنا|انضم|telegram|discord/i.test(text)) continue;
        lines.push(text);
      }
    }

    if (lines.length === 0) {
      const rawText = container.text().trim();
      return rawText.replace(/\n\s*\n/g, "\n\n");
    }

    return lines.join("\n\n");
  }
};

if (typeof harbor !== "undefined" && harbor.register) {
  harbor.register(plugin);
}