const BASE = "https://standardebooks.org";

async function getDoc(path) {
  const res = await harbor.http(BASE + path, {
    responseType: "text",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
  });
  if (!res.ok) throw new Error("http " + res.status + " for " + path);
  return harbor.parseHtml(res.body);
}

function abs(url) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return BASE + url;
  return BASE + "/" + url;
}

const plugin = {
  id: "standardebooks-source",
  name: "Standard Ebooks",

  async popular(offset) {
    const page = Math.floor(offset / 48) + 1;
    const doc = await getDoc("/ebooks?page=" + page);
    return doc.querySelectorAll(".grid li, ol li").map(el => {
      const link = el.querySelector("a");
      const img = el.querySelector("img");
      if (!link) return null;

      const href = link.attr("href") || "";
      const title = el.querySelector(".title")?.text() || link.text() || "";
      const id = href.replace(/^\/ebooks\//, "").replace(/\/$/, "");

      return {
        id: id,
        title: title.trim(),
        cover: abs(img?.attr("src")),
        author: el.querySelector(".author")?.text()?.trim()
      };
    }).filter(Boolean);
  },

  async search(query, offset) {
    const doc = await getDoc("/ebooks?query=" + encodeURIComponent(query));
    return doc.querySelectorAll(".grid li, ol li").map(el => {
      const link = el.querySelector("a");
      const img = el.querySelector("img");
      if (!link) return null;

      const href = link.attr("href") || "";
      const title = el.querySelector(".title")?.text() || link.text() || "";
      const id = href.replace(/^\/ebooks\//, "").replace(/\/$/, "");

      return {
        id: id,
        title: title.trim(),
        cover: abs(img?.attr("src")),
        author: el.querySelector(".author")?.text()?.trim()
      };
    }).filter(Boolean);
  },

  async detail(id) {
    const doc = await getDoc("/ebooks/" + id);
    const title = doc.querySelector("h1")?.text() || id;
    const img = doc.querySelector("picture img, .hero-image img");
    const desc = doc.querySelector(".description, #description")?.text();

    return {
      id,
      title: title.trim(),
      cover: abs(img?.attr("src")),
      description: desc ? desc.trim() : "",
      author: doc.querySelector(".author a")?.text()?.trim()
    };
  },

  async chapters(id) {
    // Standard Ebooks يوفر قراءة النص عبر مسار /text
    return [
      {
        id: "ebooks/" + id + "/text",
        chapter: "1",
        position: 0,
        title: "Full Book Text",
        pages: 0,
        language: "en"
      }
    ];
  },

  async content(chapterId) {
    const doc = await getDoc("/" + chapterId);
    const blocks = doc.querySelectorAll("article p, section p, p");
    return blocks.map(node => node.text().trim()).filter(Boolean).join("\n\n");
  }
};
