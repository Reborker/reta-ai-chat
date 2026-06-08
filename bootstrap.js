/* global Zotero, Services, MozXULElement, Components */

const ADDON_ID = "zby-ai-chat@example.com";
const PREF_API_KEY = "extensions.zbyAIChat.apiKey";
const PREF_MODEL = "extensions.zbyAIChat.model";
const PREF_INCLUDE_FULL_TEXT = "extensions.zbyAIChat.includeFullText";
const PREF_API_BASE = "extensions.zbyAIChat.apiBase";

let rootURIGlobal = "";
let registeredSectionID = null;

function install() {}

function uninstall() {}

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

    if (!doc.getElementById("zby-ai-katex-css")) {
      const link = doc.createElementNS("http://www.w3.org/1999/xhtml", "link");
      link.id = "zby-ai-katex-css";
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

function startup({ id, version, rootURI }, reason) {
  rootURIGlobal = rootURI;

  registeredSectionID = Zotero.ItemPaneManager.registerSection({
    paneID: "reta-ai-chat-section",
    pluginID: ADDON_ID,
    header: {
      l10nID: "reta-ai-chat-header",
      icon: rootURIGlobal + "icons/ai.svg",
    },
    sidenav: {
      l10nID: "reta-ai-chat-header",
      icon: rootURIGlobal + "icons/ai.svg",
    },
    onRender: ({ body, item }) => {
      renderAIChat(body, item);
    },
  });

  Zotero.debug("[AI Chat] started");
}

function shutdown() {
  if (registeredSectionID) {
    Zotero.ItemPaneManager.unregisterSection(registeredSectionID);
    registeredSectionID = null;
  }

  for (const win of Zotero.getMainWindows()) {
    win.document.querySelector('[href="zby-ai-chat.ftl"]')?.remove();
  }

  Zotero.debug("[AI Chat] shutdown");
}

function onMainWindowLoad({ window }) {
  window.MozXULElement.insertFTLIfNeeded("zby-ai-chat.ftl");
}

function onMainWindowUnload({ window }) {
  window.document.querySelector('[href="zby-ai-chat.ftl"]')?.remove();
}

function html(doc, tag, className) {
  const el = doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
  if (className) el.className = className;
  return el;
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

function renderAIChat(body, item) {
  const doc = body.ownerDocument;
  body.textContent = "";

  const root = html(doc, "div", "zby-ai-chat-root");
  const style = html(doc, "style");
style.textContent = `
  .zby-ai-message-content p {
    margin: 0.4em 0;
  }

  .zby-ai-message-content h1,
  .zby-ai-message-content h2,
  .zby-ai-message-content h3,
  .zby-ai-message-content h4 {
    margin: 0.7em 0 0.4em;
    line-height: 1.3;
  }

  .zby-ai-message-content ul,
  .zby-ai-message-content ol {
    margin: 0.4em 0 0.4em 1.5em;
    padding-left: 1em;
  }

  .zby-ai-message-content blockquote {
    margin: 0.6em 0;
    padding-left: 0.8em;
    border-left: 3px solid var(--fill-quinary, #ccc);
    opacity: 0.9;
  }

  .zby-ai-message-content code {
    font-family: monospace;
    background: var(--fill-quinary, #eee);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .zby-ai-message-content pre {
    overflow-x: auto;
    background: var(--fill-quinary, #eee);
    padding: 8px;
    border-radius: 6px;
  }

  .zby-ai-message-content pre code {
    background: transparent;
    padding: 0;
  }

  .zby-ai-message-content table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.6em 0;
    font-size: 12px;
  }

  .zby-ai-message-content th,
  .zby-ai-message-content td {
    border: 1px solid var(--fill-quinary, #ccc);
    padding: 4px 6px;
    vertical-align: top;
  }
`;

  root.appendChild(style);
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.gap = "8px";
  root.style.padding = "8px";
  root.style.minHeight = "320px";

  const status = html(doc, "div");
  status.style.fontSize = "12px";
  status.style.opacity = "0.8";

  if (!item || !item.isRegularItem()) {
    status.textContent = "请选择一篇普通文献条目。";
    root.appendChild(status);
    body.appendChild(root);
    return;
  }

  status.textContent = `当前文献：${item.getField("title") || "(无标题)"}`;

  const apiKeyInput = html(doc, "input");
  apiKeyInput.type = "password";
  apiKeyInput.placeholder = "OpenAI API Key";
  apiKeyInput.value = Zotero.Prefs.get(PREF_API_KEY) || "";
  apiKeyInput.style.width = "100%";
  apiKeyInput.style.boxSizing = "border-box";
  apiKeyInput.addEventListener("change", () => {
    Zotero.Prefs.set(PREF_API_KEY, apiKeyInput.value.trim());
  });

  const modelInput = html(doc, "input");
  modelInput.type = "text";
  modelInput.placeholder = "模型名，例如 gpt-4.1";
  modelInput.value = Zotero.Prefs.get(PREF_MODEL) || "gpt-4.1";
  modelInput.style.width = "100%";
  modelInput.style.boxSizing = "border-box";
  modelInput.addEventListener("change", () => {
    Zotero.Prefs.set(PREF_MODEL, modelInput.value.trim() || "gpt-4.1");
  });

  const includeFullTextLabel = html(doc, "label");
  includeFullTextLabel.style.fontSize = "12px";

  const includeFullTextCheckbox = html(doc, "input");
  includeFullTextCheckbox.type = "checkbox";
  includeFullTextCheckbox.checked = !!Zotero.Prefs.get(PREF_INCLUDE_FULL_TEXT);
  includeFullTextCheckbox.addEventListener("change", () => {
    Zotero.Prefs.set(PREF_INCLUDE_FULL_TEXT, includeFullTextCheckbox.checked);
  });

  includeFullTextLabel.appendChild(includeFullTextCheckbox);
  includeFullTextLabel.appendChild(doc.createTextNode(" 基于 PDF 全文回答"));

  const messages = html(doc, "div");
  messages.style.border = "1px solid var(--fill-quinary, #ddd)";
  messages.style.borderRadius = "6px";
  messages.style.padding = "8px";
  messages.style.minHeight = "160px";
  messages.style.maxHeight = "300px";
  messages.style.overflowY = "auto";
  messages.style.whiteSpace = "pre-wrap";
  messages.style.fontSize = "13px";

  messages.style.userSelect = "text";
  messages.style.setProperty("-moz-user-select", "text");
  messages.style.cursor = "text";

  const textarea = html(doc, "textarea");
  textarea.placeholder = "问这篇文献一个问题。Enter 发送，Ctrl+Enter 换行。";
  textarea.rows = 4;
  textarea.style.width = "100%";
  textarea.style.boxSizing = "border-box";

  const button = html(doc, "button");
  button.textContent = "发送";
  button.style.alignSelf = "flex-end";

  async function sendQuestion() {
  const question = textarea.value.trim();
  if (!question || button.disabled) return;

  appendMessage(messages, "你", question);
  textarea.value = "";

  button.disabled = true;
  textarea.disabled = true;
  button.textContent = "思考中...";

  try {
    const context = await buildContextFromItem(item, question);
    const answer = await askAI(question, context);
    appendMessage(messages, "AI", answer);
  } catch (err) {
    appendMessage(messages, "错误", err.message || String(err));
    Zotero.debug(`[AI Chat] ${err.stack || err}`);
  } finally {
    button.disabled = false;
    textarea.disabled = false;
    button.textContent = "发送";
    textarea.focus();
  }
}

button.addEventListener("click", sendQuestion);
textarea.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter") return;

  // Ctrl + Enter：换行
  if (event.ctrlKey) {
    return;
  }

  // Enter：发送
  event.preventDefault();
  event.stopPropagation();

  await sendQuestion();
});

  root.appendChild(status);
  root.appendChild(apiKeyInput);
  root.appendChild(modelInput);
  root.appendChild(includeFullTextLabel);
  root.appendChild(messages);
  root.appendChild(textarea);
  root.appendChild(button);

  body.appendChild(root);
}

function appendMessage(container, role, text) {
  const doc = container.ownerDocument;

  const block = html(doc, "div");
  block.style.marginBottom = "10px";
  block.style.padding = "8px";
  block.style.borderRadius = "6px";
  block.style.lineHeight = "1.6";
  block.style.userSelect = "text";
  block.style.setProperty("-moz-user-select", "text");
  block.style.cursor = "text";

  const header = html(doc, "div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.marginBottom = "6px";

  const roleEl = html(doc, "strong");
  roleEl.textContent = role;

  header.appendChild(roleEl);

  if (role === "AI") {
    const copyBtn = html(doc, "button");
    copyBtn.textContent = "复制";
    copyBtn.style.fontSize = "12px";
    copyBtn.addEventListener("click", async () => {
      await copyTextToClipboard(text);
      copyBtn.textContent = "已复制";
      setTimeout(() => {
        copyBtn.textContent = "复制";
      }, 1200);
    });

    header.appendChild(copyBtn);
  }

  const content = html(doc, "div");
  content.className = "zby-ai-message-content";
  content.style.userSelect = "text";
  content.style.setProperty("-moz-user-select", "text");
  content.style.cursor = "text";

  if (role === "AI") {
    content.innerHTML = renderMarkdown(doc, text);

    // 让链接更安全
    for (const link of content.querySelectorAll("a")) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    }

    // 渲染 LaTeX 公式
    renderMath(content);
  } else {
    content.textContent = text;
    content.style.whiteSpace = "pre-wrap";
  }

  block.appendChild(header);
  block.appendChild(content);

  container.appendChild(block);
  container.scrollTop = container.scrollHeight;
}

async function buildContextFromItem(item, question) {
  const title = item.getField("title") || "";
  const abstractNote = item.getField("abstractNote") || "";
  const date = item.getField("date") || "";
  const publicationTitle = item.getField("publicationTitle") || "";
  const DOI = item.getField("DOI") || "";
  const url = item.getField("url") || "";

  const creators = item.getCreators()
    .map(c => {
      if (c.name) return c.name;
      return [c.firstName, c.lastName].filter(Boolean).join(" ");
    })
    .filter(Boolean)
    .join("; ");

  const tags = item.getTags()
    .map(t => t.tag)
    .filter(Boolean)
    .join(", ");

  const notes = getNotesText(item);

  let pdfPart = "";

  if (Zotero.Prefs.get(PREF_INCLUDE_FULL_TEXT)) {
  const fullText = await getAttachmentFullText(item);

  if (fullText) {
    const result = cleanAndLimitPDFText(fullText, 120000);

    pdfPart = [
      "",
      "",
      "【PDF 全文】",
      "以下内容来自当前文献的 PDF 全文索引。请优先基于这部分全文内容回答。",
      result.truncated
        ? `【注意：PDF 全文过长，已截断。原始字符数：${result.originalLength}，发送字符数：${result.sentLength}。】`
        : `【PDF 全文字符数：${result.sentLength}】`,
      "",
      result.text
    ].join("\n");

    Zotero.debug(`[AI Chat] PDF full text chars: ${result.originalLength}`);
    Zotero.debug(`[AI Chat] PDF sent chars: ${result.sentLength}`);
    Zotero.debug(`[AI Chat] PDF truncated: ${result.truncated}`);
  } else {
    pdfPart = "\n\n【PDF 全文】\n未能读取到 PDF 全文索引。";
    Zotero.debug("[AI Chat] No PDF full text found.");
  }
}

  const context = `
【文献元数据】
标题：${title}
作者：${creators}
年份/日期：${date}
期刊/来源：${publicationTitle}
DOI：${DOI}
URL：${url}
标签：${tags}

【摘要】
${abstractNote}

【笔记】
${notes}
${pdfPart}
`.trim();

  Zotero.debug(`[AI Chat] total context chars: ${context.length}`);

  return context;
}

function getNotesText(item) {
  const noteIDs = item.getNotes();
  const parts = [];

  for (const id of noteIDs) {
    const note = Zotero.Items.get(id);
    if (!note) continue;

    const htmlText = note.getNote() || "";
    const plainText = htmlText
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (plainText) parts.push(plainText);
  }

  return parts.join("\n\n");
}

async function getAttachmentFullText(item) {
  if (!item.isRegularItem()) return "";

  const attachmentIDs = item.getAttachments();
  const parts = [];

  for (const id of attachmentIDs) {
    const attachment = Zotero.Items.get(id);
    if (!attachment) continue;

    if (
      attachment.attachmentContentType === "application/pdf" ||
      attachment.attachmentContentType === "text/html"
    ) {
      const text = await attachment.attachmentText;
      if (text) parts.push(text);
    }
  }

  return parts.join("\n\n");
}

function cleanAndLimitPDFText(text, maxChars = 120000) {
  const clean = String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/-\n/g, "")
    .trim();

  if (clean.length <= maxChars) {
    return {
      text: clean,
      truncated: false,
      originalLength: clean.length,
      sentLength: clean.length
    };
  }

  return {
    text: clean.slice(0, maxChars),
    truncated: true,
    originalLength: clean.length,
    sentLength: maxChars
  };
}

function retrieveRelevantChunks(text, query, options = {}) {
  const {
    topK = 8,
    chunkSize = 1800,
    overlap = 250,
    maxTotalChars = 16000
  } = options;

  const cleanText = cleanPDFText(text);
  const chunks = chunkTextByParagraph(cleanText, chunkSize, overlap);
  const queryTerms = extractQueryTerms(query);

  Zotero.debug(`[AI Chat] PDF chunks count: ${chunks.length}`);
  Zotero.debug(`[AI Chat] query terms: ${queryTerms.join(", ")}`);

  const scored = chunks.map((chunk, index) => {
    const score = scoreChunk(chunk, query, queryTerms);

    return {
      index,
      text: chunk,
      score
    };
  });

  let selected = scored
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  /*
   * 如果一个片段都没匹配到，说明关键词检索失败。
   * 这在中文问题、PDF 提取质量差、问题很抽象时会发生。
   * 这时退回到取 PDF 开头部分，因为论文开头通常包含摘要、引言、研究问题。
   */
  if (!selected.length && chunks.length) {
    selected = chunks.slice(0, Math.min(4, chunks.length)).map((chunk, index) => ({
      index,
      text: chunk,
      score: 0
    }));
  }

  /*
   * 控制发送给模型的总长度，避免上下文过长。
   */
  const limited = [];
  let totalChars = 0;

  for (const item of selected) {
    if (totalChars + item.text.length > maxTotalChars) {
      const remaining = maxTotalChars - totalChars;
      if (remaining > 500) {
        limited.push({
          ...item,
          text: item.text.slice(0, remaining) + "\n【该片段因长度限制被截断】"
        });
      }
      break;
    }

    limited.push(item);
    totalChars += item.text.length;
  }

  /*
   * 最后按原文顺序排列，而不是按分数排列。
   * 这样模型读起来更接近论文原始结构。
   */
  return limited.sort((a, b) => a.index - b.index);
}

function cleanPDFText(text) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/-\n/g, "")
    .trim();
}

function chunkTextByParagraph(text, chunkSize = 1800, overlap = 250) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).length <= chunkSize) {
      current = current ? current + "\n\n" + paragraph : paragraph;
    } else {
      if (current) {
        chunks.push(current);
      }

      if (paragraph.length > chunkSize) {
        const subChunks = chunkLongText(paragraph, chunkSize, overlap);
        chunks.push(...subChunks);
        current = "";
      } else {
        current = paragraph;
      }
    }
  }

  if (current) {
    chunks.push(current);
  }

  return addOverlapToChunks(chunks, overlap);
}

function chunkLongText(text, chunkSize = 1800, overlap = 250) {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }

  return chunks;
}

function addOverlapToChunks(chunks, overlap = 250) {
  if (overlap <= 0 || chunks.length <= 1) {
    return chunks;
  }

  return chunks.map((chunk, index) => {
    const prev = index > 0 ? chunks[index - 1].slice(-overlap) : "";
    const next = index < chunks.length - 1 ? chunks[index + 1].slice(0, overlap) : "";

    return [
      prev ? `【上文延续】${prev}` : "",
      chunk,
      next ? `【下文延续】${next}` : ""
    ].filter(Boolean).join("\n");
  });
}

function extractQueryTerms(query) {
  const normalized = query.toLowerCase();

  const stopwords = new Set([
    "这篇", "文章", "论文", "文献", "什么", "哪些", "如何", "是否",
    "有没有", "作者", "研究", "请问", "请", "帮我", "总结", "分析",
    "the", "and", "or", "of", "in", "to", "for", "with", "a", "an"
  ]);

  const terms = [];

  /*
   * 提取英文单词和数字。
   */
  const latinTerms = normalized
    .split(/[^\p{L}\p{N}]+/u)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !stopwords.has(t));

  terms.push(...latinTerms);

  /*
   * 提取中文连续文本。
   */
  const chineseParts = query.match(/[\u4e00-\u9fa5]+/g) || [];

  for (const part of chineseParts) {
    /*
     * 保留较长中文词组。
     */
    if (part.length >= 2 && !stopwords.has(part)) {
      terms.push(part);
    }

    /*
     * 生成 2 字短语。
     */
    for (let i = 0; i < part.length - 1; i++) {
      const gram = part.slice(i, i + 2);
      if (!stopwords.has(gram)) {
        terms.push(gram);
      }
    }

    /*
     * 生成 3 字短语，中文问题通常 3 字短语更有信息量。
     */
    for (let i = 0; i < part.length - 2; i++) {
      const gram = part.slice(i, i + 3);
      if (!stopwords.has(gram)) {
        terms.push(gram);
      }
    }
  }

  /*
   * 去重，避免重复加分过多。
   */
  return Array.from(new Set(terms))
    .filter(t => t.length >= 2)
    .slice(0, 80);
}

function scoreChunk(chunk, query, queryTerms) {
  const lowerChunk = chunk.toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();

  let score = 0;

  for (const term of queryTerms) {
    const lowerTerm = term.toLowerCase();

    if (!lowerTerm) continue;

    const count = countOccurrences(lowerChunk, lowerTerm);

    if (count > 0) {
      /*
       * 长词更重要。
       */
      const weight = lowerTerm.length >= 4 ? 3 : lowerTerm.length === 3 ? 2 : 1;
      score += count * weight;
    }
  }

  /*
   * 如果片段里直接包含问题中的关键短句，额外加分。
   */
  if (normalizedQuery.length >= 6 && lowerChunk.includes(normalizedQuery)) {
    score += 20;
  }

  /*
   * 常见学术问题关键词加权。
   */
  const academicKeywords = [
    "method", "methods", "methodology", "data", "dataset", "sample",
    "result", "results", "finding", "findings", "conclusion",
    "limitation", "limitations", "discussion", "experiment",
    "研究方法", "方法", "数据", "样本", "实验", "结果", "发现",
    "结论", "局限", "讨论", "贡献", "理论", "模型", "变量"
  ];

  for (const kw of academicKeywords) {
    if (query.includes(kw) && lowerChunk.includes(kw.toLowerCase())) {
      score += 5;
    }
  }

  return score;
}

function countOccurrences(text, term) {
  if (!term) return 0;

  let count = 0;
  let pos = 0;

  while (true) {
    const found = text.indexOf(term, pos);
    if (found === -1) break;

    count++;
    pos = found + term.length;
  }

  return count;
}

async function askAI(question, context) {
  const apiKey = Zotero.Prefs.get(PREF_API_KEY);
  const apiBase = Zotero.Prefs.get(PREF_API_BASE) || "https://api.deepseek.com";
  const model = Zotero.Prefs.get(PREF_MODEL) || "deepseek-v4-pro";

  if (!apiKey) {
    throw new Error("请先填写 API Key。");
  }

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: [
            "你是一个严谨、详细的学术文献阅读助手。",
            "请基于用户提供的文献资料回答，不要编造不存在的信息。",
            "回答必须尽量具体、完整，不要只给一两句话。",
            "如果资料足够，请按照以下结构回答：",
            "1. 核心结论",
            "2. 研究问题",
            "3. 研究方法",
            "4. 关键发现",
            "5. 理论贡献",
            "6. 局限性",
            "7. 可用于论文写作的表述",
            "如果资料不足，也要说明缺少哪些信息。",
            "涉及数学公式、统计模型或变量关系时，请使用标准 LaTeX 公式格式。",
            "行内公式使用 $...$，独立公式使用 $$...$$。"
          ].join("\n")
        },
        {
          role: "user",
          content: [
            "下面是 Zotero 当前文献的资料。",
            "如果包含【PDF 全文】，说明系统已经读取了当前文献 PDF 的全文索引。",
            "请优先基于【PDF 全文】回答；如果 PDF 全文中没有足够依据，再参考摘要、笔记和元数据。",
            "",
            context,
            "",
            "用户问题：",
            question,
            "",
            "请详细回答，不要只回答一两句话。",
            "如果全文中没有足够依据，请明确说明“当前 PDF 全文内容不足以回答”。"
          ].join("\n")
        }
      ],
      temperature: 0.3,
      max_tokens: 3000,
      stream: false
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API 调用失败：${response.status} ${errorText}`);
  }

  const data = await response.json();

  return data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
}

function extractOutputText(data) {
  const parts = [];

  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) {
        parts.push(content.text);
      }
    }
  }

  return parts.join("\n");
}
function copyTextToClipboard(text) {
  const clipboard = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
    .getService(Components.interfaces.nsIClipboardHelper);

  clipboard.copyString(text);
}