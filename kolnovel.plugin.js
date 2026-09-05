(() => {
  const BASE = "https://kolnovel.com";

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
    try { full = decodeURI(full); } catch (e) {}
    return encodeURI(full);
  }

  async function getDoc(path) {
    const targetUrl = safeUrl(path);
    const res = await harbor.http(targetUrl, {
      responseType: "text",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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

  function cardToSummary(el) {
    const link = el.querySelector("a");
    if (!link) return null;

    const href = link.attr("href") || "";
    const match = href.match(/\/series\/([^\/]+)/);
    if (!match) return null;

    const slug = match[1];
    const img = el.querySelector("img");
    const cover = img?.attr("data-src") || img?.attr("data-lazy-src") || img?.attr("src");

    let rawTitle = link.attr("title") || el.querySelector(".tt, .title, h4")?.text() || link.text() || slug;
    try { rawTitle = decodeURIComponent(rawTitle); } catch (e) {}

    return {
      id: slug,
      title: rawTitle.replace(/\s+(?:kol|كول|رواية)$/iu, "").trim(),
      cover: abs(cover)
    };
  }

  const plugin = {
    id: "kolnovel-source",
    name: "KolNovel",

    async popular(offset) {
      try {
        const page = Math.floor(offset / 20) + 1;
        const path = page === 1 ? "/series/" : `/series/page/${page}/`;
        const doc = await getDoc(path);
        return doc.querySelectorAll(".listupd .bsx, .bsx").map(cardToSummary).filter(Boolean);
      } catch (e) {
        return [];
      }
    },

    async search(query, offset) {
      try {
        const page = Math.floor(offset / 20) + 1;
        const path = page === 1 ? `/?s=${encodeURIComponent(query)}` : `/page/${page}/?s=${encodeURIComponent(query)}`;
        const doc = await getDoc(path);
        return doc.querySelectorAll(".listupd .bsx, .bsx, .search-item").map(cardToSummary).filter(Boolean);
      } catch (e) {
        return [];
      }
    },

    async detail(id) {
      const doc = await getDoc(`/series/${id}/`);
      let title = doc.querySelector("h1.entry-title, h1")?.text() || id;
      try { title = decodeURIComponent(title); } catch (e) {}

      const img = doc.querySelector(".thumb img, .series-thumb img, img.wp-post-image");
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
      const links = doc.querySelectorAll(".eplister ul li a, ul.chapter-list li a, .cl_list li a");
      const total = links.length;
      if (total === 0) return [];

      const list = new Array(total);
      for (let i = 0; i < total; i++) {
        const a = links[i];
        const href = a.attr("href") || "";
        const numNode = a.querySelector(".epl-num, .chapternum");
        const titleNode = a.querySelector(".epl-title");

        let chapterTitle = numNode ? `فصل ${numNode.text().trim()}` : a.text().trim();
        if (numNode && titleNode) chapterTitle += ` - ${titleNode.text().trim()}`;

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
      const container = doc.querySelector(".epcontent, #readerarea, .entry-content");
      if (!container) return "";

      const paragraphs = container.querySelectorAll("p");
      const lines = [];
      for (let i = 0; i < paragraphs.length; i++) {
        const text = paragraphs[i].text().trim();
        if (text && !/kolnovel|كول\s*نوفل|discord|انضم|سيرفرنا/i.test(text)) {
          lines.push(text);
        }
      }
      return lines.length > 0 ? lines.join("\n\n") : container.text().trim();
    }
  };

  if (typeof harbor !== "undefined" && harbor.register) {
    harbor.register(plugin);
  }
})();