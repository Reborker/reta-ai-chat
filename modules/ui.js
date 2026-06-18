/* global Zotero, html, openSettingsDialog, PREF_INCLUDE_FULL_TEXT, buildContextFromItem, askAIStream, renderMarkdown, renderMath, copyTextToClipboard, createEmptyItemChatData, loadItemChatData, saveItemChatData, createChatSession, createSessionTitle, createChatMessage, getRecentMessagesForPrompt */

function renderAIChat(body, item) {
  const doc = body.ownerDocument;
  const win = doc.defaultView;
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

  if (!item || (!item.isRegularItem() && !isSupportedStandaloneAttachment(item))) {
  status.textContent = "请选择一篇普通文献条目，或选择一个 PDF/HTML 附件。";
  root.appendChild(status);
  body.appendChild(root);
  return;
  }

function isSupportedStandaloneAttachment(item) {
  return !!(
    item &&
    item.isAttachment &&
    item.isAttachment() &&
    (
      item.attachmentContentType === "application/pdf" ||
      item.attachmentContentType === "text/html"
    )
  );
  }

  let chatData = createEmptyItemChatData(item);
  let currentSession = null;
  let historyReady = false;
  let isGenerating = false;

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

  const historyBar = html(doc, "div");
  historyBar.style.display = "flex";
  historyBar.style.gap = "6px";
  historyBar.style.alignItems = "center";

  const sessionSelect = html(doc, "select");
  sessionSelect.style.flex = "1";
  sessionSelect.style.minWidth = "0";
  sessionSelect.style.fontSize = "12px";

  const newChatButton = html(doc, "button");
  newChatButton.textContent = "新对话";
  newChatButton.style.fontSize = "12px";

  const deleteChatButton = html(doc, "button");
  deleteChatButton.textContent = "删除";
  deleteChatButton.style.fontSize = "12px";

  historyBar.appendChild(sessionSelect);
  historyBar.appendChild(newChatButton);
  historyBar.appendChild(deleteChatButton);

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
  button.textContent = "加载历史...";
  button.style.alignSelf = "flex-end";
  button.disabled = true;

  function updateHistoryControls() {
    const hasSessions = !!(chatData && chatData.sessions && chatData.sessions.length);
    sessionSelect.disabled = !historyReady || isGenerating || !hasSessions;
    newChatButton.disabled = !historyReady || isGenerating;
    deleteChatButton.disabled = !historyReady || isGenerating || !currentSession;
  }

  function renderSessionList() {
    sessionSelect.textContent = "";

    const sessions = chatData.sessions || [];

    if (!sessions.length) {
      const option = html(doc, "option");
      option.value = "";
      option.textContent = "无历史对话";
      sessionSelect.appendChild(option);
      currentSession = null;
      updateHistoryControls();
      return;
    }

    for (const session of sessions) {
      const option = html(doc, "option");
      option.value = session.id;
      option.textContent = session.title || "未命名对话";

      if (currentSession && session.id === currentSession.id) {
        option.selected = true;
      }

      sessionSelect.appendChild(option);
    }

    updateHistoryControls();
  }

  function renderCurrentSessionMessages() {
    messages.textContent = "";

    if (!currentSession) {
      const empty = html(doc, "div");
      empty.textContent = "暂无历史对话。点击“新对话”或直接输入问题开始。";
      empty.style.fontSize = "12px";
      empty.style.opacity = "0.7";
      messages.appendChild(empty);
      return;
    }

    for (const msg of currentSession.messages || []) {
      if (msg.role === "user") {
        appendMessage(messages, "你", msg.content);
      } else if (msg.role === "assistant") {
        appendMessage(messages, "AI", msg.content);
      }
    }
  }

  function getCurrentSessionID() {
  return currentSession ? currentSession.id : "";
  }

function rebindCurrentSession(sessionID) {
  if (!sessionID) {
    currentSession = null;
    return;
  }

  currentSession = (chatData.sessions || []).find(session => session.id === sessionID) || null;
  }

  async function saveAndRebindCurrentSession() {
  const sessionID = getCurrentSessionID();

  chatData = await saveItemChatData(item, chatData);

  rebindCurrentSession(sessionID);

  return currentSession;
  }

  async function initHistory() {
    try {
      chatData = await loadItemChatData(item);
      currentSession = chatData.sessions[0] || null;
      renderSessionList();
      renderCurrentSessionMessages();
    } catch (err) {
      messages.textContent = "";
      appendMessage(messages, "错误", `读取历史对话失败：${err.message || String(err)}`);
      Zotero.debug(`[AI Chat] load history failed: ${err.stack || err}`);
    } finally {
      historyReady = true;
      button.disabled = false;
      button.textContent = "发送";
      updateHistoryControls();
    }
  }

  async function startNewChat() {
    if (!historyReady || isGenerating) return;

    if (currentSession && (!currentSession.messages || !currentSession.messages.length)) {
      renderCurrentSessionMessages();
      textarea.focus();
      return;
    }

    currentSession = createChatSession();
    chatData.sessions.unshift(currentSession);

    await saveAndRebindCurrentSession();

    renderSessionList();
    renderCurrentSessionMessages();
    textarea.focus();
  }

  async function deleteCurrentChat() {
    if (!historyReady || isGenerating || !currentSession) return;

    const ok = win.confirm("确定删除当前历史对话吗？");
    if (!ok) return;

    const deletingID = currentSession.id;
    chatData.sessions = (chatData.sessions || []).filter(session => session.id !== deletingID);
    currentSession = chatData.sessions[0] || null;

    await saveAndRebindCurrentSession();

    renderSessionList();
    renderCurrentSessionMessages();
    textarea.focus();
  }

  sessionSelect.addEventListener("change", () => {
    const sessionID = sessionSelect.value;
    currentSession = (chatData.sessions || []).find(session => session.id === sessionID) || null;
    renderSessionList();
    renderCurrentSessionMessages();
  });

  newChatButton.addEventListener("click", () => {
    startNewChat().catch(err => {
      appendMessage(messages, "错误", err.message || String(err));
      Zotero.debug(`[AI Chat] new chat failed: ${err.stack || err}`);
    });
  });

  deleteChatButton.addEventListener("click", () => {
    deleteCurrentChat().catch(err => {
      appendMessage(messages, "错误", err.message || String(err));
      Zotero.debug(`[AI Chat] delete chat failed: ${err.stack || err}`);
    });
  });

  async function sendQuestion() {
  const question = textarea.value.trim();
  if (!question || button.disabled || isGenerating) return;

  if (!historyReady) {
    appendMessage(messages, "错误", "历史记录尚未加载完成，请稍后再试。");
    return;
  }

  if (!currentSession) {
    currentSession = createChatSession(question);
    chatData.sessions.unshift(currentSession);
  }

  const sessionID = currentSession.id;

  if (!currentSession.messages || !currentSession.messages.length) {
    currentSession.title = createSessionTitle(question);
  }

  /*
   * 注意：previousMessages 必须在 push 当前问题之前获取，
   * 否则当前问题会重复传给模型。
   */
  const previousMessages = getRecentMessagesForPrompt(currentSession.messages || []);

  const userMessage = createChatMessage("user", question);
  currentSession.messages.push(userMessage);
  currentSession.updatedAt = new Date().toISOString();

  appendMessage(messages, "你", question);
  textarea.value = "";

  renderSessionList();

  const streamingAI = appendStreamingAIMessage(messages);

  isGenerating = true;
  button.disabled = true;
  textarea.disabled = true;
  button.textContent = "读取文献...";
  updateHistoryControls();

  try {
    /*
     * 这里保存用户问题后，必须重新绑定 currentSession。
     */
    await saveAndRebindCurrentSession();

    if (!currentSession) {
      throw new Error("保存用户问题后，无法重新定位当前会话。");
    }

    const context = await buildContextFromItem(item, question);

    button.textContent = "生成中...";

    let fullAnswer = "";

    fullAnswer = await askAIStream(question, context, previousMessages, (delta, text) => {
      fullAnswer = text;
      streamingAI.update(fullAnswer, false);
    });

    const finalAnswer = fullAnswer || "（没有收到模型输出）";

    streamingAI.update(finalAnswer, true);

    /*
     * 这里一定要 push 到重新绑定后的 currentSession。
     */
    currentSession.messages.push(createChatMessage("assistant", finalAnswer));
    currentSession.updatedAt = new Date().toISOString();

    await saveAndRebindCurrentSession();

    renderSessionList();
  } catch (err) {
    const errorText = err.message || String(err);

    streamingAI.update("生成失败。", true);

    if (currentSession) {
      currentSession.messages.push(createChatMessage("assistant", `生成失败：${errorText}`));
      currentSession.updatedAt = new Date().toISOString();

      try {
        await saveAndRebindCurrentSession();
      } catch (saveErr) {
        Zotero.debug(`[AI Chat] save failed after error: ${saveErr.stack || saveErr}`);
      }
    }

    appendMessage(messages, "错误", errorText);
    Zotero.debug(`[AI Chat] ${err.stack || err}`);
  } finally {
    /*
     * 再保险：确保 currentSession 仍然指向 chatData.sessions 里的对象。
     */
    rebindCurrentSession(sessionID);

    isGenerating = false;
    button.disabled = false;
    textarea.disabled = false;
    button.textContent = "发送";
    updateHistoryControls();
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
  root.appendChild(historyBar);
  root.appendChild(includeFullTextLabel);
  root.appendChild(messages);
  root.appendChild(textarea);
  root.appendChild(button);

  body.appendChild(root);

  initHistory();
}

function appendStreamingAIMessage(container) {
  const doc = container.ownerDocument;

  let currentText = "";
  let renderTimer = null;

  const row = html(doc, "div");
  row.style.display = "flex";
  row.style.justifyContent = "flex-start";
  row.style.marginBottom = "12px";
  row.style.width = "100%";

  const block = html(doc, "div");
  block.style.display = "flex";
  block.style.flexDirection = "column";
  block.style.alignItems = "flex-start";
  block.style.maxWidth = "86%";
  block.style.userSelect = "text";
  block.style.setProperty("-moz-user-select", "text");
  block.style.cursor = "text";

  const header = html(doc, "div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.gap = "8px";
  header.style.marginBottom = "4px";
  header.style.fontSize = "11px";
  header.style.opacity = "0.75";
  header.style.width = "100%";

  const roleEl = html(doc, "span");
  roleEl.textContent = "AI";

  const copyBtn = html(doc, "button");
  copyBtn.textContent = "复制";
  copyBtn.style.fontSize = "11px";
  copyBtn.style.padding = "1px 6px";
  copyBtn.addEventListener("click", async () => {
    await copyTextToClipboard(currentText);
    copyBtn.textContent = "已复制";
    setTimeout(() => {
      copyBtn.textContent = "复制";
    }, 1200);
  });

  header.appendChild(roleEl);
  header.appendChild(copyBtn);

  const bubble = html(doc, "div");
  bubble.style.borderRadius = "14px 14px 14px 4px";
  bubble.style.padding = "8px 10px";
  bubble.style.lineHeight = "1.6";
  bubble.style.boxShadow = "0 1px 2px rgba(0, 0, 0, 0.08)";
  bubble.style.wordBreak = "break-word";
  bubble.style.overflowWrap = "anywhere";
  bubble.style.userSelect = "text";
  bubble.style.setProperty("-moz-user-select", "text");
  bubble.style.cursor = "text";
  bubble.style.background = "#EEEEF0";
  bubble.style.color = "var(--fill-primary, #111)";
  bubble.style.border = "1px solid #DDDDDF";

  const content = html(doc, "div");
  content.className = "reta-ai-message-content";
  content.style.userSelect = "text";
  content.style.setProperty("-moz-user-select", "text");
  content.style.cursor = "text";
  content.textContent = "正在思考...";

  bubble.appendChild(content);
  block.appendChild(header);
  block.appendChild(bubble);
  row.appendChild(block);
  container.appendChild(row);

  container.scrollTop = container.scrollHeight;

  function render(final = false) {
  if (!currentText) {
    content.textContent = "正在思考...";
  } else {
    content.innerHTML = renderMarkdown(doc, currentText);

    for (const link of content.querySelectorAll("a")) {
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener noreferrer");
    }

    /*
     * 流式过程中，只要检测到已经有完整公式，就立即尝试渲染。
     * final=true 时无论如何都再渲染一次，确保最终内容正确。
     */
    if (final || hasCompleteMath(currentText)) {
      renderMath(content);
    }
  }

  container.scrollTop = container.scrollHeight;
  }

  function update(text, final = false) {
    currentText = text || "";

    if (final) {
      if (renderTimer) {
        clearTimeout(renderTimer);
        renderTimer = null;
      }

      render(true);
      return;
    }

    /*
     * 节流渲染。
     * 不要每收到一个 token 都重新 Markdown 渲染，否则长回答会比较卡。
     */
    if (renderTimer) return;

    renderTimer = setTimeout(() => {
      renderTimer = null;
      render(false);
    }, 80);
  }

  return {
    update,
    getText() {
      return currentText;
    }
  };
}

function hasCompleteMath(text) {
  const source = stripCodeBlocksForMathCheck(String(text || ""));

  return (
    hasPairedDelimiter(source, "$$") ||
    hasPairedDelimiter(source, "\\[", "\\]") ||
    hasPairedDelimiter(source, "\\(", "\\)") ||
    hasInlineDollarMath(source)
  );
}

function stripCodeBlocksForMathCheck(text) {
  return text
    // 去掉 Markdown 代码块，避免代码里的 $ 被误判成公式
    .replace(/```[\s\S]*?```/g, "")
    // 去掉行内代码，避免 `price = $10` 被误判
    .replace(/`[^`]*`/g, "");
}

function hasPairedDelimiter(text, left, right = left) {
  let start = -1;
  let searchFrom = 0;

  while (true) {
    start = text.indexOf(left, searchFrom);
    if (start === -1) return false;

    // 忽略被转义的分隔符
    if (isEscaped(text, start)) {
      searchFrom = start +left.length;
      continue;
    }

    const end = text.indexOf(right, start + left.length);
    if (end !== -1 && !isEscaped(text, end)) {
      return true;
    }

    searchFrom = start + left.length;
  }
}

function hasInlineDollarMath(text) {
  /*
   * 只判断 $...$，并排除 $$...$$。
   * 注意：如果你的回答中经常出现美元符号，建议不要启用 $...$ 行内公式。
   */
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "$") continue;
    if (isEscaped(text, i)) continue;

    // 跳过 $$
    if (text[i + 1] === "$" || text[i - 1] === "$") continue;

    for (let j = i + 1; j < text.length; j++) {
      if (text[j] !== "$") continue;
      if (isEscaped(text, j)) continue;

      // 跳过 $$
      if (text[j + 1] === "$" || text[j - 1] === "$") continue;

      return true;
    }
  }

  return false;
}

function isEscaped(text, index) {
  let backslashCount = 0;

  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) {
    backslashCount++;
  }

  return backslashCount % 2 === 1;
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