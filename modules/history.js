/* global Zotero, Services, Components, IOUtils, PathUtils, TextEncoder, TextDecoder */

var HISTORY_STORE_VERSION = 1;
var HISTORY_DIR_NAME = "reta-ai-chat";
var HISTORY_FILE_NAME = "history.json";
var HISTORY_MAX_PROMPT_MESSAGES = 20;

var historyStoreCache = null;
var historyWriteQueue = Promise.resolve();

function createEmptyHistoryStore() {
  return {
    version: HISTORY_STORE_VERSION,
    updatedAt: new Date().toISOString(),
    items: {}
  };
}

function createEmptyItemChatData(item) {
  return {
    libraryID: item?.libraryID || null,
    itemID: item?.id || null,
    itemKey: item?.key || "",
    title: item?.getField ? (item.getField("title") || "") : "",
    sessions: []
  };
}

function getItemHistoryKey(item) {
  if (!item || !isHistorySupportedItem(item)) {
    throw new Error("无法为当前条目保存历史对话。");
  }

  const libraryID = item.libraryID || 0;
  const itemKey = item.key || String(item.id);

  return `${libraryID}:${itemKey}`;
}

function isHistorySupportedItem(item) {
  const isRegular = !!(
    item &&
    typeof item.isRegularItem === "function" &&
    item.isRegularItem()
  );

  const isSupportedAttachment = !!(
    item &&
    typeof item.isAttachment === "function" &&
    item.isAttachment() &&
    (
      item.attachmentContentType === "application/pdf" ||
      item.attachmentContentType === "text/html"
    )
  );

  return isRegular || isSupportedAttachment;
}

async function getHistoryFilePath() {
  const profileDir = Services.dirsvc
    .get("ProfD", Components.interfaces.nsIFile)
    .path;

  const historyDir = joinPath(profileDir, HISTORY_DIR_NAME);

  await makeDirectoryIfMissing(historyDir);

  return joinPath(historyDir, HISTORY_FILE_NAME);
}

function joinPath(...parts) {
  if (typeof PathUtils !== "undefined" && PathUtils.join) {
    return PathUtils.join(...parts);
  }

  const sep = Services.appinfo.OS === "WINNT" ? "\\" : "/";
  return parts
    .filter(Boolean)
    .join(sep)
    .replace(new RegExp(`[${sep === "\\" ? "\\\\" : sep}]+`, "g"), sep);
}

async function makeDirectoryIfMissing(path) {
  if (typeof IOUtils === "undefined") {
    throw new Error("当前 Zotero 环境不支持 IOUtils，无法读写 JSON 历史文件。");
  }

  try {
    await IOUtils.makeDirectory(path, {
      ignoreExisting: true,
      createAncestors: true
    });
  } catch (e) {
    if (!(await IOUtils.exists(path))) {
      throw e;
    }
  }
}

async function readTextFile(path) {
  if (!(await IOUtils.exists(path))) {
    return "";
  }

  if (typeof IOUtils.readUTF8 === "function") {
    return await IOUtils.readUTF8(path);
  }

  const bytes = await IOUtils.read(path);
  return new TextDecoder("utf-8").decode(bytes);
}

async function writeTextFile(path, text) {
  if (typeof IOUtils.writeUTF8 === "function") {
    await IOUtils.writeUTF8(path, text, {
      tmpPath: `${path}.tmp`
    });
    return;
  }

  const bytes = new TextEncoder().encode(text);
  await IOUtils.write(path, bytes, {
    tmpPath: `${path}.tmp`
  });
}

async function loadHistoryStore() {
  if (historyStoreCache) {
    return historyStoreCache;
  }

  const path = await getHistoryFilePath();
  const text = await readTextFile(path);

  if (!text.trim()) {
    historyStoreCache = createEmptyHistoryStore();
    return historyStoreCache;
  }

  try {
    historyStoreCache = normalizeHistoryStore(JSON.parse(text));
  } catch (e) {
    Zotero.debug(`[AI Chat] history JSON parse failed: ${e.stack || e}`);

    try {
      const backupPath = `${path}.broken-${Date.now()}`;
      await writeTextFile(backupPath, text);
      Zotero.debug(`[AI Chat] broken history backed up to: ${backupPath}`);
    } catch (backupError) {
      Zotero.debug(`[AI Chat] failed to back up broken history: ${backupError.stack || backupError}`);
    }

    historyStoreCache = createEmptyHistoryStore();
  }

  return historyStoreCache;
}

function normalizeHistoryStore(store) {
  const normalized = store && typeof store === "object"
    ? store
    : createEmptyHistoryStore();

  normalized.version = HISTORY_STORE_VERSION;

  if (!normalized.items || typeof normalized.items !== "object") {
    normalized.items = {};
  }

  return normalized;
}

function normalizeItemChatData(data, item) {
  const normalized = data && typeof data === "object"
    ? data
    : createEmptyItemChatData(item);

  normalized.libraryID = item?.libraryID || normalized.libraryID || null;
  normalized.itemID = item?.id || normalized.itemID || null;
  normalized.itemKey = item?.key || normalized.itemKey || "";
  normalized.title = item?.getField ? (item.getField("title") || normalized.title || "") : (normalized.title || "");

  if (!Array.isArray(normalized.sessions)) {
    normalized.sessions = [];
  }

  normalized.sessions = normalized.sessions
    .filter(session => session && typeof session === "object")
    .map(normalizeChatSession)
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

  return normalized;
}

function normalizeChatSession(session) {
  const now = new Date().toISOString();

  const normalized = {
    id: session.id || createID("chat"),
    title: session.title || "未命名对话",
    createdAt: session.createdAt || now,
    updatedAt: session.updatedAt || session.createdAt || now,
    messages: Array.isArray(session.messages) ? session.messages : []
  };

  normalized.messages = normalized.messages
    .filter(msg => msg && typeof msg === "object")
    .map(msg => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: String(msg.content || ""),
      createdAt: msg.createdAt || now
    }))
    .filter(msg => msg.content.trim());

  return normalized;
}

async function saveHistoryStore(store) {
  const normalized = normalizeHistoryStore(store);
  normalized.updatedAt = new Date().toISOString();
  historyStoreCache = normalized;

  const path = await getHistoryFilePath();
  const json = JSON.stringify(normalized, null, 2);

  historyWriteQueue = historyWriteQueue
    .catch(() => {})
    .then(() => writeTextFile(path, json));

  await historyWriteQueue;
}

async function loadItemChatData(item) {
  const store = await loadHistoryStore();
  const key = getItemHistoryKey(item);

  return normalizeItemChatData(store.items[key], item);
}

async function saveItemChatData(item, itemChatData) {
  const store = await loadHistoryStore();
  const key = getItemHistoryKey(item);

  store.items[key] = normalizeItemChatData(itemChatData, item);

  await saveHistoryStore(store);

  return store.items[key];
}

function createChatSession(firstQuestion = "") {
  const now = new Date().toISOString();

  return {
    id: createID("chat"),
    title: createSessionTitle(firstQuestion),
    createdAt: now,
    updatedAt: now,
    messages: []
  };
}

function createChatMessage(role, content) {
  return {
    role: role === "assistant" ? "assistant" : "user",
    content: String(content || ""),
    createdAt: new Date().toISOString()
  };
}

function createSessionTitle(text) {
  const title = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!title) {
    return "新对话";
  }

  return title.length > 30 ? `${title.slice(0, 30)}...` : title;
}

function createID(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getRecentMessagesForPrompt(messages, maxMessages = HISTORY_MAX_PROMPT_MESSAGES) {
  return (Array.isArray(messages) ? messages : [])
    .filter(msg => msg && (msg.role === "user" || msg.role === "assistant") && msg.content)
    .slice(-maxMessages)
    .map(msg => ({
      role: msg.role,
      content: msg.content
    }));
}
