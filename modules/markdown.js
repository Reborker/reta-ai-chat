/* global Zotero, Services, rootURIGlobal */

function loadMarkdownLibs(win) {
  try {
    if (!rootURIGlobal) {
      Zotero.debug("[AI Chat] rootURIGlobal is empty");
      return false;
    }

    if (!win.marked) {
      const markedURL = rootURIGlobal + "lib/marked.umd.js";
      Zotero.debug(`[AI Chat] loading marked from: ${markedURL}`);
      Services.scriptloader.loadSubScript(markedURL, win);
    }

    if (!win.DOMPurify) {
      const purifyURL = rootURIGlobal + "lib/purify.min.js";
      Zotero.debug(`[AI Chat] loading DOMPurify from: ${purifyURL}`);
      Services.scriptloader.loadSubScript(purifyURL, win);
    }

    Zotero.debug(`[AI Chat] marked loaded: ${!!win.marked}`);
    Zotero.debug(`[AI Chat] DOMPurify loaded: ${!!win.DOMPurify}`);

    return !!win.marked;
  } catch (e) {
    Zotero.debug(`[AI Chat] Markdown libs load failed: ${e.stack || e}`);
    return false;
  }
}

function loadMathLibs(win) {
  try {
    if (!rootURIGlobal) {
      Zotero.debug("[AI Chat] rootURIGlobal is empty, skip KaTeX");
      return false;
    }

    const doc = win.document;

    if (!doc.getElementById("reta-ai-katex-css")) {
      const link = doc.createElementNS("http://www.w3.org/1999/xhtml", "link");
      link.id = "reta-ai-katex-css";
      link.setAttribute("rel", "stylesheet");
      link.setAttribute("href", rootURIGlobal + "lib/katex/katex.min.css");
      doc.documentElement.appendChild(link);
    }

    if (!win.katex) {
      Services.scriptloader.loadSubScript(
        rootURIGlobal + "lib/katex/katex.min.js",
        win
      );
    }

    if (!win.renderMathInElement) {
      Services.scriptloader.loadSubScript(
        rootURIGlobal + "lib/katex/contrib/auto-render.min.js",
        win
      );
    }

    Zotero.debug(`[AI Chat] KaTeX loaded: ${!!win.katex}`);
    Zotero.debug(`[AI Chat] auto-render loaded: ${!!win.renderMathInElement}`);

    return !!(win.katex && win.renderMathInElement);
  } catch (e) {
    Zotero.debug(`[AI Chat] KaTeX load failed: ${e.stack || e}`);
    return false;
  }
}

function renderMath(container) {
  const doc = container.ownerDocument;
  const win = doc.defaultView;

  const ok = loadMathLibs(win);

  if (!ok || !win.renderMathInElement) {
    Zotero.debug("[AI Chat] KaTeX not available, skip math rendering");
    return;
  }

  try {
    win.renderMathInElement(container, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\(", right: "\\)", display: false }
      ],
      throwOnError: false,
      strict: false,
      ignoredTags: [
        "script", "noscript", "style", "textarea", "pre", "code"
      ]
    });
  } catch (e) {
    Zotero.debug(`[AI Chat] KaTeX render failed: ${e.stack || e}`);
  }
}

function renderMarkdown(doc, markdownText) {
  const win = doc.defaultView;

  const ok = loadMarkdownLibs(win);

  Zotero.debug(`[AI Chat] markdown libs ok: ${ok}`);
  Zotero.debug(`[AI Chat] win.marked exists: ${!!win.marked}`);
  Zotero.debug(`[AI Chat] win.DOMPurify exists: ${!!win.DOMPurify}`);

  if (!win.marked) {
    Zotero.debug("[AI Chat] marked not found, fallback to plain text");
    return escapeHTML(markdownText || "");
  }

  let parseMarkdown = null;

  if (typeof win.marked.parse === "function") {
    parseMarkdown = win.marked.parse.bind(win.marked);
  } else if (typeof win.marked.marked === "function") {
    parseMarkdown = win.marked.marked.bind(win.marked);
  } else if (typeof win.marked === "function") {
    parseMarkdown = win.marked;
  }

  if (!parseMarkdown) {
    Zotero.debug("[AI Chat] marked loaded but parse function not found");
    return escapeHTML(markdownText || "");
  }

  let rawHTML = "";

  try {
    rawHTML = parseMarkdown(markdownText || "", {
      gfm: true,
      breaks: false
    });
  } catch (e) {
    Zotero.debug(`[AI Chat] marked parse failed: ${e.stack || e}`);
    return escapeHTML(markdownText || "");
  }

  rawHTML = normalizeHTMLForXHTML(rawHTML);

  if (!win.DOMPurify) {
    Zotero.debug("[AI Chat] DOMPurify not found, fallback to escaped text");
    return escapeHTML(markdownText || "");
  }

  let cleanHTML = "";

  try {
    cleanHTML = win.DOMPurify.sanitize(rawHTML, {
      ALLOWED_TAGS: [
        "p", "br", "strong", "em", "del",
        "ul", "ol", "li",
        "blockquote",
        "code", "pre",
        "h1", "h2", "h3", "h4",
        "table", "thead", "tbody", "tr", "th", "td",
        "a", "hr"
      ],
      ALLOWED_ATTR: [
        "href", "title", "target", "rel"
      ]
    });
  } catch (e) {
    Zotero.debug(`[AI Chat] DOMPurify sanitize failed: ${e.stack || e}`);
    return escapeHTML(markdownText || "");
  }

  return normalizeHTMLForXHTML(cleanHTML);
}

function normalizeHTMLForXHTML(html) {
  return String(html || "")
    .replace(/<br\s*>/gi, "<br/>")
    .replace(/<hr\s*>/gi, "<hr/>");
}

function escapeHTML(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
