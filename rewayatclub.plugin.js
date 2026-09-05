(() => {
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
    try { full = decodeURI(full); } catch (e) {}
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

  const plugin = {
    id: "rewayatclub-source",
    name: "Rewayat Club",

    async popular(offset) {
      const page = Math.floor(offset / 20) + 1;
      const path = page === 1 ? "/library" : `/library?page=${page}`;
      const doc = await getDoc(path);

      // التقاط جميع روابط الروايات مباشرة من شجرة عناصر Nuxt
      const links = doc.querySelectorAll("a[href*='/novel/']");
      const novels = new Map();

      for (let i = 0; i < links.length; i++) {
        const a = links[i];
        const href = a.attr("href") || "";
        const match = href.match(/\/novel\/([^\/\?#]+)/);
        if (!match) continue;

        const slug = match[1];
        if (!slug || ["library", "page", "search", "user", "login", "register"].includes(slug)) continue;

        const current = novels.get(slug) || { id: slug, title: "", cover: undefined };

        const text = (a.attr("title") || a.text() || "").replace(/\s+/g, " ").trim();
        if (text && (!current.title || current.title === slug)) {
          current.title = cleanTitle(text);
        }

        const img = a.querySelector("img") || a.parent?.querySelector("img");
        const coverUrl = img?.attr("src") || img?.attr("data-src") || img?.attr("data-lazy-src");
        if (coverUrl && !current.cover) {
          current.cover = abs(coverUrl);
        }

        novels.set(slug, current);
      }

      return Array.from(novels.values()).map(n => {
        if (!n.title) {
          try { n.title = decodeURIComponent(n.id); } catch (e) { n.title = n.id; }
        }
        return n;
      });
    },

    async search(query, offset) {
      const page = Math.floor(offset / 20) + 1;
      const path = `/library?search=${encodeURIComponent(query)}&page=${page}`;
      const doc = await getDoc(path);

      const links = doc.querySelectorAll("a[href*='/novel/']");
      const novels = new Map();

      for (let i = 0; i < links.length; i++) {
        const a = links[i];
        const href = a.attr("href") || "";
        const match = href.match(/\/novel\/([^\/\?#]+)/);
        if (!match) continue;

        const slug = match[1];
        if (!slug || ["library", "page", "search"].includes(slug)) continue;

        const current = novels.get(slug) || { id: slug, title: "", cover: undefined };
        const text = (a.attr("title") || a.text() || "").replace(/\s+/g, " ").trim();
        if (text && (!current.title || current.title === slug)) {
          current.title = cleanTitle(text);
        }

        const img = a.querySelector("img") || a.parent?.querySelector("img");
        const coverUrl = img?.attr("src") || img?.attr("data-src") || img?.attr("data-lazy-src");
        if (coverUrl && !current.cover) {
          current.cover = abs(coverUrl);
        }

        novels.set(slug, current);
      }

      return Array.from(novels.values()).map(n => {
        if (!n.title) {
          try { n.title = decodeURIComponent(n.id); } catch (e) { n.title = n.id; }
        }
        return n;
      });
    },

    async detail(id) {
      const doc = await getDoc(`/novel/${id}`);
      let title = doc.querySelector("h1")?.text() || id;
      try { title = decodeURIComponent(title); } catch (e) {}

      const img = doc.querySelector("img[src*='cover'], img[src*='novel'], img");
      const desc = doc.querySelector("p, .description, .summary")?.text()?.trim();

      return {
        id,
        title: cleanTitle(title),
        cover: abs(img?.attr("src") || img?.attr("data-src")),
        description: desc || "",
        author: undefined
      };
    },

    async chapters(id) {
      const doc = await getDoc(`/novel/${id}`);
      // روابط الفصول تتبع صيغة /novel/{id}/{chapterNum}
      const links = doc.querySelectorAll(`a[href*='/novel/${id}/']`);
      const chaptersMap = new Map();

      for (let i = 0; i < links.length; i++) {
        const a = links[i];
        const href = a.attr("href") || "";
        const match = href.match(new RegExp(`/novel/${id}/([^\\/\\?#]+)`));
        if (!match) continue;

        const chNum = match[1];
        if (!chaptersMap.has(chNum)) {
          const rawTitle = a.text().replace(/\s+/g, " ").trim();
          chaptersMap.set(chNum, {
            id: href.replace(/^https?:\/\/[^\/]+/, "").replace(/^\//, ""),
            title: rawTitle || `فصل ${chNum}`,
            chNum: parseFloat(chNum) || i
          });
        }
      }

      // ترتيب الفصول تصاعدياً
      const sorted = Array.from(chaptersMap.values()).sort((a, b) => a.chNum - b.chNum);

      return sorted.map((ch, index) => ({
        id: ch.id,
        position: index,
        title: ch.title,
        pages: 0,
        language: "ar"
      }));
    },

    async content(chapterId) {
      const doc = await getDoc("/" + chapterId);
      const paragraphs = doc.querySelectorAll("p");
      const lines = [];

      for (let i = 0; i < paragraphs.length; i++) {
        const text = paragraphs[i].text().trim();
        if (!text) continue;
        if (/rewayat\.club|ديسكورد|سيرفرنا|انضم|telegram|discord/i.test(text)) continue;
        lines.push(text);
      }

      return lines.join("\n\n");
    }
  };

  if (typeof harbor !== "undefined" && harbor.register) {
    harbor.register(plugin);
  }
})();