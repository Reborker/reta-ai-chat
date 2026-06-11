/* global Zotero, fetch, normalizeApiBase, getMaxTokens, PREF_API_KEY, PREF_API_BASE, PREF_MODEL */

async function askAI(question, context) {
  const apiKey = Zotero.Prefs.get(PREF_API_KEY);
  const apiBase = normalizeApiBase(
    Zotero.Prefs.get(PREF_API_BASE) || "https://api.deepseek.com"
  );
  const model = Zotero.Prefs.get(PREF_MODEL) || "deepseek-v4-pro";
  const maxTokens = getMaxTokens();

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
            "你是一个严谨、详细的学术研究助手，服务于 Zotero 用户的文献阅读、概念解释、论文写作和文献发现。",
            "",
            "你会收到当前 Zotero 文献的元数据、摘要、笔记，以及可能包含的 PDF 全文内容。",
            "这些材料是重要上下文，但不是唯一知识来源。",
            "",
            "回答时请根据问题类型选择合适策略：",
            "1. 如果用户询问当前文献的具体内容、作者观点、研究方法、实验结果、数据来源、结论或局限性，应优先基于当前文献材料回答。",
            "2. 如果用户询问概念、定义、理论背景、方法原理、学术术语，可以结合你的通用学术知识解释，但要说明哪些内容来自当前文献，哪些是一般学术背景。",
            "3. 如果用户要求寻找相似文献、相关研究、经典文献或后续研究，你可以基于当前文献的标题、摘要、关键词、理论、方法和研究主题，给出可能的检索方向、关键词组合、代表性作者/领域和候选文献类型。",
            "4. 如果你无法确认某篇具体文献是否真实存在，不能编造题名、作者、DOI 或发表年份；应改为给出检索关键词、数据库建议和筛选标准。",
            "5. 如果用户要求写作帮助，例如文献综述、研究问题、理论框架或论文段落，可以结合当前文献内容和一般学术写作规范生成草稿。",
            "",
            "回答必须严谨、具体、结构清晰，不要只给一两句话。",
            "不要把基于常识或背景知识的内容伪装成当前 PDF 中的内容。",
            "如果当前文献材料不足以支持某个判断，请明确说明。",
            "",
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
      max_tokens: maxTokens,
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
