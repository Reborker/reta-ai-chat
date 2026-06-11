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
  messages.style.borderRadius = "6px";
  messages.style.padding = "8px";
  messages.style.minHeight = "650px";
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

  root.appendChild(topBar);
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
  content.className = "reta-ai-message-content";
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
