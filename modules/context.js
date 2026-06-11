/* global Zotero, PREF_INCLUDE_FULL_TEXT, DEFAULT_PDF_MAX_CHARS, getPDFMaxChars, countOccurrences */

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
    const pdfMaxChars = getPDFMaxChars();
    const result = cleanAndLimitPDFText(fullText, pdfMaxChars);

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

function cleanAndLimitPDFText(text, maxChars = DEFAULT_PDF_MAX_CHARS) {
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
