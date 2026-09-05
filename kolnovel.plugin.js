// Harbor eBook source plugin for KolNovel
const BASE = "https://kolnovel.com";

async function getDoc(path) {
  let targetUrl = path;
  if (!targetUrl.startsWith("http")) {
    targetUrl = BASE + (path.startsWith("/") ? path : "/" + path);
  }
  
  const res = await harbor.http(targetUrl, {
    responseType: "text",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Referer": BASE + "/"
    }
  });
  if (!res.ok) throw new Error("http " + res.status + " for " + targetUrl);
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
  const link = el.querySelector(".bsx a, a");
  if (!link) return null;

  const href = link.attr("href") || "";
  // استخراج المعرف سواء كان يحتوي على series أو في الجذر
  const match = href.match(/\/series\/([^\/]+)\/?/) || href.match(/kolnovel\.com\/([^\/]+)\/?/);
  if (!match) return null;

  const id = match[1];
  const img = el.querySelector("img");
  const rawTitle = link.attr("title") || el.querySelector(".tt, .title")?.text() || link.text() || id;
  const cover = img?.attr("data-src") || img?.attr("data-lazy-src") || img?.attr("src");

  return {
    id: id,
    title: cleanTitle(rawTitle),
    cover: abs(cover)
  };
}

const plugin = {
  id: "kolnovel-source",
  name: "KolNovel",

  async popular(offset) {
    const page = Math.floor(offset / 20) + 1;
    const path = page === 1 ? "/series/?order=update" : `/series/?page=${page}&order=update`;
    const doc = await getDoc(path);
    return doc.querySelectorAll(".listupd article.bs, .listupd .bsx, article.bs").map(cardToSummary).filter(Boolean);
  },

  async search(query, offset) {
    const page = Math.floor(offset / 20) + 1;
    const path = page === 1 ? `/?s=${encodeURIComponent(query)}` : `/page/${page}/?s=${encodeURIComponent(query)}`;
    const doc = await getDoc(path);
    return doc.querySelectorAll(".listupd article.bs, .listupd .bsx, .search-item").map(cardToSummary).filter(Boolean);
  },

  async detail(id) {
    const doc = await getDoc(`/series/${id}/`);
    const title = doc.querySelector("h1.entry-title, h1")?.text() || decodeURIComponent(id);
    const img = doc.querySelector(".thumb img, .series-thumb img");
    const desc = doc.querySelector(".entry-content, .series-synops, .summary")?.text()?.trim();
    const author = doc.querySelector(".author, .spe span")?.text()?.replace(/المؤلف\s*:/i, "")?.trim();

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
    const links = doc.querySelectorAll(".eplister ul li a, ul.chapter-list li a");
    const total = links.length;

    const list = [];
    for (let i = total - 1; i >= 0; i--) {
      const a = links[i];
      const href = a.attr("href") || "";
      if (!href) continue;

      const numNode = a.querySelector(".epl-num, .chapternum, .name");
      const title = numNode ? numNode.text().trim() : a.text().trim();

      // نحفظ مسار الرابط كاملاً في الـ id لضمان طلبه بدقة في content()
      const cleanPath = href.replace(/^https?:\/\/[^\/]+\//, "");

      list.push({
        id: cleanPath,
        position: list.length,
        title: title,
        pages: 0,
        language: "ar"
      });
    }

    return list;
  },

  async content(chapterId) {
    // chapterId الآن يحمل المسار الدقيق مثل shaag24%d9%84%d9%88%d8%b1%d8%af...
    const doc = await getDoc("/" + chapterId);

    // استخراج فقرات الفصل بدقة من حاوية القراءة الخاصة بـ KolNovel
    const paragraphs = doc.querySelectorAll(".epcontent p, .entry-content p");
    const lines = [];

    for (let i = 0; i < paragraphs.length; i++) {
      const text = paragraphs[i].text().trim();
      if (!text) continue;
      // استبعاد نصوص الإعلانات وتنبيهات الموقع
      if (text.includes("kolnovel") || text.includes("انضموا إلى سيرفرنا") || text.includes("discord.gg")) continue;
      lines.push(text);
    }

    return lines.join("\n\n");
  }
};