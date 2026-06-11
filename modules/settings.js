/* global Zotero, html, normalizeApiBase, clampInt, getPDFMaxChars, getMaxTokens, PREF_API_BASE, PREF_API_KEY, PREF_MODEL, PREF_PDF_MAX_CHARS, PREF_MAX_TOKENS, DEFAULT_PDF_MAX_CHARS, DEFAULT_MAX_TOKENS, MIN_PDF_MAX_CHARS, MAX_PDF_MAX_CHARS, MIN_MAX_TOKENS, MAX_MAX_TOKENS */

function openSettingsDialog(win) {
  const doc = win.document;

  // 避免重复打开多个设置窗口
  const existing = doc.getElementById("reta-ai-settings-overlay");
  if (existing) {
    existing.remove();
  }

  const overlay = html(doc, "div");
  overlay.id = "reta-ai-settings-overlay";
  overlay.style.position = "fixed";
  overlay.style.left = "0";
  overlay.style.top = "0";
  overlay.style.right = "0";
  overlay.style.bottom = "0";
  overlay.style.background = "rgba(0, 0, 0, 0.35)";
  overlay.style.zIndex = "999999";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";

  const dialog = html(doc, "div");
  dialog.style.width = "460px";
  dialog.style.maxWidth = "calc(100vw - 40px)";
  dialog.style.background = "var(--material-background, #fff)";
  dialog.style.color = "var(--fill-primary, #000)";
  dialog.style.border = "1px solid var(--fill-quinary, #ccc)";
  dialog.style.borderRadius = "10px";
  dialog.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.25)";
  dialog.style.padding = "16px";
  dialog.style.display = "flex";
  dialog.style.flexDirection = "column";
  dialog.style.gap = "12px";

  const title = html(doc, "div");
  title.textContent = "AI 配置";
  title.style.fontSize = "16px";
  title.style.fontWeight = "600";

  const desc = html(doc, "div");
  desc.textContent = "配置 AI 服务地址、API Key 和模型名称。保存后会立即写入 Zotero 偏好设置。";
  desc.style.fontSize = "12px";
  desc.style.opacity = "0.75";
  desc.style.lineHeight = "1.5";

  const apiBaseInput = createSettingsInput(
    doc,
    "AI 服务地址",
    "例如：https://api.deepseek.com",
    Zotero.Prefs.get(PREF_API_BASE) || "https://api.deepseek.com",
    "text"
  );

  const apiKeyInput = createSettingsInput(
    doc,
    "API Key",
    "请输入 API Key",
    Zotero.Prefs.get(PREF_API_KEY) || "",
    "password"
  );

  const modelInput = createSettingsInput(
    doc,
    "模型名称",
    "例如：deepseek-v4-pro",
    Zotero.Prefs.get(PREF_MODEL) || "deepseek-v4-pro",
    "text"
  );

  const pdfMaxCharsInput = createSettingsInput(
  doc,
  "PDF 最大发送字符数",
  "例如：120000",
  String(getPDFMaxChars()),
  "number"
  );
  pdfMaxCharsInput.input.min = String(MIN_PDF_MAX_CHARS);
  pdfMaxCharsInput.input.max = String(MAX_PDF_MAX_CHARS);
  pdfMaxCharsInput.input.step = "1000";

  const maxTokensInput = createSettingsInput(
    doc,
    "最大输出 Token 数",
    "例如：3000",
    String(getMaxTokens()),
    "number"
  );
  maxTokensInput.input.min = String(MIN_MAX_TOKENS);
  maxTokensInput.input.max = String(MAX_MAX_TOKENS);
  maxTokensInput.input.step = "100";

  const buttonRow = html(doc, "div");
  buttonRow.style.display = "flex";
  buttonRow.style.justifyContent = "flex-end";
  buttonRow.style.gap = "8px";

  const cancelButton = html(doc, "button");
  cancelButton.textContent = "取消";
  cancelButton.addEventListener("click", () => {
    overlay.remove();
  });

  const saveButton = html(doc, "button");
  saveButton.textContent = "保存";
  saveButton.addEventListener("click", () => {
  const apiBase = apiBaseInput.input.value.trim() || "https://api.deepseek.com";
  const apiKey = apiKeyInput.input.value.trim();
  const model = modelInput.input.value.trim() || "deepseek-v4-pro";
  const pdfMaxChars = clampInt(
    pdfMaxCharsInput.input.value,
    DEFAULT_PDF_MAX_CHARS,
    MIN_PDF_MAX_CHARS,
    MAX_PDF_MAX_CHARS
  );
  const maxTokens = clampInt(
    maxTokensInput.input.value,
    DEFAULT_MAX_TOKENS,
    MIN_MAX_TOKENS,
    MAX_MAX_TOKENS
  );

  Zotero.Prefs.set(PREF_API_BASE, normalizeApiBase(apiBase));
  Zotero.Prefs.set(PREF_API_KEY, apiKey);
  Zotero.Prefs.set(PREF_MODEL, model);
  Zotero.Prefs.set(PREF_PDF_MAX_CHARS, pdfMaxChars);
  Zotero.Prefs.set(PREF_MAX_TOKENS, maxTokens);

    overlay.remove();

    Zotero.debug(`[AI Chat] settings saved: apiBase=${normalizeApiBase(apiBase)}, model=${model}`);
  });

  buttonRow.appendChild(cancelButton);
  buttonRow.appendChild(saveButton);

  dialog.appendChild(title);
  dialog.appendChild(desc);
  dialog.appendChild(apiBaseInput.root);
  dialog.appendChild(apiKeyInput.root);
  dialog.appendChild(modelInput.root);
  dialog.appendChild(pdfMaxCharsInput.root);
  dialog.appendChild(maxTokensInput.root);
  dialog.appendChild(buttonRow);

  overlay.appendChild(dialog);
  doc.documentElement.appendChild(overlay);

  // 点击遮罩关闭，但点击对话框本身不关闭
  overlay.addEventListener("click", event => {
    if (event.target === overlay) {
      overlay.remove();
    }
  });

  dialog.addEventListener("click", event => {
    event.stopPropagation();
  });

  // Esc 关闭
  const keyHandler = event => {
    if (event.key === "Escape") {
      overlay.remove();
      win.removeEventListener("keydown", keyHandler);
    }
  };
  win.addEventListener("keydown", keyHandler);

  apiBaseInput.input.focus();
}

function createSettingsInput(doc, labelText, placeholder, value, type = "text") {
  const root = html(doc, "label");
  root.style.display = "flex";
  root.style.flexDirection = "column";
  root.style.gap = "4px";
  root.style.fontSize = "12px";

  const label = html(doc, "span");
  label.textContent = labelText;
  label.style.fontWeight = "500";

  const input = html(doc, "input");
  input.type = type;
  input.placeholder = placeholder;
  input.value = value || "";
  input.style.width = "100%";
  input.style.boxSizing = "border-box";

  root.appendChild(label);
  root.appendChild(input);

  return {
    root,
    input
  };
}
