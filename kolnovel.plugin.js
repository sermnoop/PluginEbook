// Harbor eBook source plugin for KolNovel
// Website: https://kolnovel.com

const BASE = "https://kolnovel.com";

async function getDoc(path) {
  const targetUrl = path.startsWith("http") ? path : (BASE + (path.startsWith("/") ? path : "/" + path));
  const res = await harbor.http(targetUrl, {
    responseType: "text",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Referer": BASE + "/",
      "Accept-Language": "ar,en;q=0.9"
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
  const link = el.querySelector(".bsx a, a.tip, h2 a, a");
  const img = el.querySelector("img");
  if (!link) return null;

  const rawTitle = (link.attr("title") || el.querySelector(".tt, .title")?.text() || link.text() || "").trim();
  const href = link.attr("href") || "";
  
  // استخراج الـ slug
  const match = href.match(/\/series\/([^\/]+)\/?/) || href.match(/\/manga\/([^\/]+)\/?/) || href.match(/\/([^\/]+)\/?$/);
  if (!match) return null;

  const id = match[1];
  let cover = img?.attr("data-src") || img?.attr("data-lazy-src") || img?.attr("src");

  return {
    id: id,
    title: cleanTitle(rawTitle),
    cover: abs(cover),
    status: el.querySelector(".status, .epx, .status-label")?.text()?.trim() || undefined
  };
}

const plugin = {
  id: "kolnovel-source",
  name: "KolNovel",

  async popular(offset, tagId) {
    const page = Math.floor(offset / 20) + 1;
    let path = page === 1 ? `/series/?order=popular` : `/series/page/${page}/?order=popular`;

    const doc = await getDoc(path);
    return doc.querySelectorAll(".listupd article, .listupd .bsx, .bs").map(cardToSummary).filter(Boolean);
  },

  async search(query, offset, tagId) {
    const page = Math.floor(offset / 20) + 1;
    const path = page === 1 ? `/?s=${encodeURIComponent(query)}` : `/page/${page}/?s=${encodeURIComponent(query)}`;
    const doc = await getDoc(path);
    return doc.querySelectorAll(".listupd article, .listupd .bsx, .c-tabs-item__content, .bs").map(cardToSummary).filter(Boolean);
  },

  async detail(id) {
    const doc = await getDoc(`/series/${id}/`);
    const root = doc.querySelector(".series-profile, .post-body, .main-info, article");
    if (!root) return null;

    const title = root.querySelector("h1.entry-title, h1")?.text() || id;
    const img = root.querySelector(".thumb img, .series-thumb img");
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
    const chapterLinks = doc.querySelectorAll(".eplister ul li a, .cl_list ul li a, ul.chapter-list li a");
    
    const items = [];
    chapterLinks.forEach(a => {
      const href = a.attr("href") || "";
      if (!href) return;

      const titleNode = a.querySelector(".epl-num, .chapternum, .name");
      const title = titleNode ? titleNode.text().trim() : a.text().trim();
      
      items.push({
        href: href.replace(BASE, "").replace(/^\//, ""),
        title: title
      });
    });

    items.reverse();

    return items.map((item, position) => {
      return {
        id: item.href,
        position,
        title: item.title,
        pages: 0,
        language: "ar"
      };
    });
  },

  async content(chapterId) {
    const doc = await getDoc("/" + chapterId);
    const paragraphs = doc.querySelectorAll(".entry-content p, .epcontent p, .reading-content p");
    
    const textBlocks = [];
    paragraphs.forEach(p => {
      const text = p.text().trim();
      if (text && !text.includes("kolnovel") && !text.includes("انضموا إلى سيرفرنا")) {
        textBlocks.push(text);
      }
    });

    return textBlocks.join("\n\n");
  },

  async tags() {
    return [
      { id: "status:ongoing", name: "مستمرة", group: "الحالة" },
      { id: "status:completed", name: "مكتملة", group: "الحالة" }
    ];
  }
};

// تسجيل الإضافة في محرك Harbor إذا كان النظام يتطلب ذلك
if (typeof harbor !== "undefined" && harbor.register) {
  harbor.register(plugin);
}
