const manifestUrl = "data/notes-manifest.json";
const categoryList = document.querySelector("#category-list");
const articleMeta = document.querySelector("#article-meta");
const articleTitle = document.querySelector("#article-title");
const articleContent = document.querySelector("#article-content");
const tocList = document.querySelector("#toc-list");
const readProgress = document.querySelector("#read-progress");

let manifest = null;
let articles = [];
let activeArticleId = "";
let visibleCategories = new Set();
let headingObserver = null;

initNotes();

async function initNotes() {
  try {
    const response = await fetch(manifestUrl);
    if (!response.ok) throw new Error("MANIFEST_NOT_FOUND");

    manifest = await response.json();
    articles = flattenArticles(manifest.categories || []);
    visibleCategories = new Set((manifest.categories || []).map((category) => category.id));

    if (!articles.length) {
      showError("还没有可展示的笔记。");
      return;
    }

    renderCategories();
    await loadArticle(getArticleFromUrl() || articles[0].id, false);
    window.addEventListener("popstate", () => loadArticle(getArticleFromUrl() || articles[0].id, false));
    window.addEventListener("scroll", updateReadProgress, { passive: true });
  } catch (error) {
    showError("笔记索引读取失败，请检查 data/notes-manifest.json。");
  }
}

function flattenArticles(categories) {
  return categories.flatMap((category) =>
    (category.articles || []).map((article) => ({
      ...article,
      categoryId: category.id,
      categoryTitle: category.title
    }))
  );
}

function getArticleFromUrl() {
  return new URLSearchParams(window.location.search).get("note");
}

async function loadArticle(articleId, pushHash = true) {
  const article = articles.find((item) => item.id === articleId) || articles[0];
  if (!article) return;

  activeArticleId = article.id;
  visibleCategories.add(article.categoryId);
  renderCategories();
  renderMeta(article);
  articleTitle.textContent = article.title;
  articleContent.innerHTML = '<p class="article-loading">正在读取文章内容。</p>';
  tocList.innerHTML = "";

  if (pushHash && getArticleFromUrl() !== article.id) {
    history.pushState(null, "", `?note=${encodeURIComponent(article.id)}`);
  }

  try {
    const response = await fetch(article.path);
    if (!response.ok) throw new Error("ARTICLE_NOT_FOUND");

    articleContent.innerHTML = await response.text();
    highlightCodeBlocks();
    addCodeBlockLabels();
    buildToc();
    updateReadProgress();
    document.title = `${article.title} | YQ Notes`;
  } catch (error) {
    articleContent.innerHTML = '<p class="article-error">文章内容读取失败，请检查文章路径。</p>';
  }
}

function renderCategories() {
  categoryList.innerHTML = "";
  const articleCategoryId = articles.find((article) => article.id === activeArticleId)?.categoryId;

  for (const category of manifest.categories || []) {
    const group = document.createElement("section");
    group.className = [
      "category-group",
      visibleCategories.has(category.id) ? "open" : "",
      category.id === articleCategoryId ? "active" : ""
    ].filter(Boolean).join(" ");

    const button = document.createElement("button");
    button.className = "category-toggle";
    button.type = "button";
    button.innerHTML = `
      <span>${escapeHtml(category.title)}</span>
      <span class="category-count">${(category.articles || []).length}</span>
      <span class="category-arrow">›</span>
    `;
    button.addEventListener("click", () => {
      if (visibleCategories.has(category.id)) {
        visibleCategories.delete(category.id);
      } else {
        visibleCategories.add(category.id);
      }
      renderCategories();
    });

    const articleList = document.createElement("div");
    articleList.className = "article-list";

    for (const article of category.articles || []) {
      const link = document.createElement("a");
      link.className = `article-link${article.id === activeArticleId ? " active" : ""}`;
      link.href = `notes.html?note=${encodeURIComponent(article.id)}`;
      link.innerHTML = `<span>▧ ${escapeHtml(article.title)}</span>`;
      link.addEventListener("click", (event) => {
        event.preventDefault();
        loadArticle(article.id);
      });
      articleList.append(link);
    }

    group.append(button, articleList);
    categoryList.append(group);
  }
}

function renderMeta(article) {
  const tags = (article.tags || []).map((tag, index) => `
    <span class="article-chip${index === 0 ? " primary" : ""}">${escapeHtml(tag)}</span>
  `).join("");

  articleMeta.innerHTML = `
    ${tags}
    <span class="article-chip">${escapeHtml(article.date || "")}</span>
  `;
}

function buildToc() {
  if (headingObserver) headingObserver.disconnect();

  const headings = [...articleContent.querySelectorAll("h2, h3")];
  if (!headings.length) {
    tocList.innerHTML = '<p class="toc-empty">本文暂无目录。</p>';
    return;
  }

  tocList.innerHTML = "";
  headings.forEach((heading, index) => {
    if (!heading.id) heading.id = `section-${index + 1}`;

    const link = document.createElement("a");
    link.className = `toc-link depth-${heading.tagName === "H3" ? "3" : "2"}`;
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      focusHeading(heading);
      setActiveTocLink(heading.id);
    });
    tocList.append(link);
  });

  headingObserver = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!visible) return;

    setActiveTocLink(visible.target.id);
  }, { rootMargin: "-12% 0px -72% 0px" });

  headings.forEach((heading) => headingObserver.observe(heading));
}

function highlightCodeBlocks() {
  articleContent.querySelectorAll("pre code").forEach((code) => {
    if (window.hljs) window.hljs.highlightElement(code);
  });
}

function addCodeBlockLabels() {
  articleContent.querySelectorAll("pre code").forEach((code) => {
    const languageClass = [...code.classList].find((name) => name.startsWith("language-"));
    if (!languageClass) return;

    const pre = code.closest("pre");
    if (!pre || pre.querySelector(".code-language")) return;

    const label = document.createElement("span");
    label.className = "code-language";
    label.textContent = formatLanguageName(languageClass.replace("language-", ""));
    pre.prepend(label);
  });
}

function formatLanguageName(language) {
  const names = {
    c: "c",
    cpp: "cpp",
    "c++": "cpp",
    cs: "csharp",
    csharp: "csharp",
    java: "java",
    js: "javascript",
    javascript: "javascript",
    ts: "typescript",
    typescript: "typescript",
    py: "python",
    python: "python",
    sh: "shell",
    shell: "shell",
    bash: "bash",
    powershell: "powershell",
    ps1: "powershell",
    html: "html",
    css: "css",
    json: "json",
    xml: "xml",
    sql: "sql",
    md: "markdown",
    markdown: "markdown"
  };

  return names[language.toLowerCase()] || language.toLowerCase();
}

function setActiveTocLink(headingId) {
  tocList.querySelectorAll(".toc-link").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${headingId}`);
  });
}

function focusHeading(heading) {
  articleContent.querySelectorAll(".heading-focus").forEach((item) => {
    item.classList.remove("heading-focus");
  });

  heading.scrollIntoView({ behavior: "smooth", block: "start" });

  window.setTimeout(() => {
    heading.classList.add("heading-focus");
    window.setTimeout(() => heading.classList.remove("heading-focus"), 1300);
  }, 360);
}

function updateReadProgress() {
  const panel = document.querySelector(".article-panel");
  const total = panel.offsetHeight - window.innerHeight;
  const current = window.scrollY - panel.offsetTop + 24;
  const percent = total > 0 ? Math.min(100, Math.max(0, (current / total) * 100)) : 0;
  readProgress.style.width = `${percent}%`;
}

function showError(message) {
  articleTitle.textContent = "笔记加载失败";
  articleContent.innerHTML = `<p class="article-error">${escapeHtml(message)}</p>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
