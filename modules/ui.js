/* global Zotero, html, openSettingsDialog, PREF_INCLUDE_FULL_TEXT, buildContextFromItem, askAI, renderMarkdown, renderMath, copyTextToClipboard */

function renderAIChat(body, item) {
  const doc = body.ownerDocument;
  body.textContent = "";

  const root = html(doc, "div", "reta-ai-chat-root");
  const style = html(doc, "style");
style.textContent = `
  .reta-ai-message-content p {
    margin: 0.4em 0;
  }

  .reta-ai-message-content h1,
  .reta-ai-message-content h2,
  .reta-ai-message-content h3,
  .reta-ai-message-content h4 {
    margin: 0.7em 0 0.4em;
    line-height: 1.3;
  }

  .reta-ai-message-content ul,
  .reta-ai-message-content ol {
    margin: 0.4em 0 0.4em 1.5em;
    padding-left: 1em;
  }

  .reta-ai-message-content blockquote {
    margin: 0.6em 0;
    padding-left: 0.8em;
    border-left: 3px solid var(--fill-quinary, #ccc);
    opacity: 0.9;
  }

  .reta-ai-message-content code {
    font-family: monospace;
    background: var(--fill-quinary, #eee);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .reta-ai-message-content pre {
    overflow-x: auto;
    background: var(--fill-quinary, #eee);
    padding: 8px;
    border-radius: 6px;
  }

  .reta-ai-message-content pre code {
    background: transparent;
    padding: 0;
  }

  .reta-ai-message-content table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.6em 0;
    font-size: 12px;
  }

  .reta-ai-message-content th,
  .reta-ai-message-content td {
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

  const topBar = html(doc, "div");
  topBar.style.display = "flex";
  topBar.style.justifyContent = "space-between";
  topBar.style.alignItems = "center";
  topBar.style.gap = "8px";

  const statusWrap = html(doc, "div");
  statusWrap.style.fontSize = "12px";
  statusWrap.style.opacity = "0.8";
  statusWrap.style.flex = "1";
  statusWrap.textContent = `当前文献：${item.getField("title") || "(无标题)"}`;

  const settingsButton = html(doc, "button");
  settingsButton.textContent = "配置";
  settingsButton.style.fontSize = "12px";
  settingsButton.addEventListener("click", () => {
    openSettingsDialog(doc.defaultView);
  });

  topBar.appendChild(statusWrap);
  topBar.appendChild(settingsButton);



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
  messages.style.borderRadius = "10px";
  messages.style.padding = "12px";
  messages.style.minHeight = "650px";
  messages.style.maxHeight = "650px";
  messages.style.overflowY = "auto";
  messages.style.whiteSpace = "normal";
  messages.style.fontSize = "13px";
  messages.style.background = "var(--material-background, #f5f5f5)";

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

  root.appendChild(topBar);
  root.appendChild(includeFullTextLabel);
  root.appendChild(messages);
  root.appendChild(textarea);
  root.appendChild(button);

  body.appendChild(root);
}

function appendMessage(container, role, text) {
  const doc = container.ownerDocument;

  const isUser = role === "你";
  const isAI = role === "AI";
  const isError = role === "错误";

  /*
   * 每条消息占一整行。
   * 用户消息靠右，AI 消息靠左。
   */
  const row = html(doc, "div");
  row.style.display = "flex";
  row.style.justifyContent = isUser ? "flex-end" : "flex-start";
  row.style.marginBottom = "12px";
  row.style.width = "100%";

  /*
   * 消息整体区域，包含角色名、复制按钮和气泡。
   */
  const block = html(doc, "div");
  block.style.display = "flex";
  block.style.flexDirection = "column";
  block.style.alignItems = isUser ? "flex-end" : "flex-start";
  block.style.maxWidth = "86%";
  block.style.userSelect = "text";
  block.style.setProperty("-moz-user-select", "text");
  block.style.cursor = "text";

  /*
   * 顶部角色栏。
   */
  const header = html(doc, "div");
  header.style.display = "flex";
  header.style.justifyContent = isUser ? "flex-end" : "space-between";
  header.style.alignItems = "center";
  header.style.gap = "8px";
  header.style.marginBottom = "4px";
  header.style.fontSize = "11px";
  header.style.opacity = "0.75";
  header.style.width = "100%";

  const roleEl = html(doc, "span");
  roleEl.textContent = role;

  if (isUser) {
    header.appendChild(roleEl);
  } else {
    header.appendChild(roleEl);

    if (isAI) {
      const copyBtn = html(doc, "button");
      copyBtn.textContent = "复制";
      copyBtn.style.fontSize = "11px";
      copyBtn.style.padding = "1px 6px";
      copyBtn.addEventListener("click", async () => {
        await copyTextToClipboard(text);
        copyBtn.textContent = "已复制";
        setTimeout(() => {
          copyBtn.textContent = "复制";
        }, 1200);
      });

      header.appendChild(copyBtn);
    }
  }

  /*
   * 真正的聊天气泡。
   */
  const bubble = html(doc, "div");
  bubble.style.borderRadius = isUser
    ? "14px 14px 4px 14px"
    : "14px 14px 14px 4px";
  bubble.style.padding = "8px 10px";
  bubble.style.lineHeight = "1.6";
  bubble.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.08)";
  bubble.style.wordBreak = "break-word";
  bubble.style.overflowWrap = "anywhere";
  bubble.style.userSelect = "text";
  bubble.style.setProperty("-moz-user-select", "text");
  bubble.style.cursor = "text";

  if (isUser) {
    /*
     * 类似微信的用户绿色气泡。
     */
    bubble.style.background = "#95ec69";
    bubble.style.color = "#111";
  } else if (isError) {
    bubble.style.background = "#ffe8e8";
    bubble.style.color = "#a40000";
    bubble.style.border = "1px solid #ffb8b8";
  } else {
    /*
     * AI 灰色气泡。
     */
    bubble.style.background = "#EEEEF0";
    bubble.style.color = "var(--fill-primary, #111)";
    bubble.style.border = "1px solid #DDDDDF";
  }

  const content = html(doc, "div");
  content.className = "reta-ai-message-content";
  content.style.userSelect = "text";
  content.style.setProperty("-moz-user-select", "text");
  content.style.cursor = "text";

  if (isAI) {
    content.innerHTML = renderMarkdown(doc, text);

    for (const link of content.querySelectorAll("a")) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    }

    renderMath(content);
  } else {
    content.textContent = text;
    content.style.whiteSpace = "pre-wrap";
  }

  bubble.appendChild(content);
  block.appendChild(header);
  block.appendChild(bubble);
  row.appendChild(block);

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}