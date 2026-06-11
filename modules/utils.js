/* global Zotero, Components, PREF_PDF_MAX_CHARS, PREF_MAX_TOKENS, DEFAULT_PDF_MAX_CHARS, DEFAULT_MAX_TOKENS, MIN_PDF_MAX_CHARS, MAX_PDF_MAX_CHARS, MIN_MAX_TOKENS, MAX_MAX_TOKENS */

function html(doc, tag, className) {
  const el = doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
  if (className) el.className = className;
  return el;
}

function clampInt(value, defaultValue, min, max) {
  const parsed = parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  return Math.min(max, Math.max(min, parsed));
}

function getIntPref(prefName, defaultValue, min, max) {
  return clampInt(Zotero.Prefs.get(prefName), defaultValue, min, max);
}

function getPDFMaxChars() {
  return getIntPref(
    PREF_PDF_MAX_CHARS,
    DEFAULT_PDF_MAX_CHARS,
    MIN_PDF_MAX_CHARS,
    MAX_PDF_MAX_CHARS
  );
}

function getMaxTokens() {
  return getIntPref(
    PREF_MAX_TOKENS,
    DEFAULT_MAX_TOKENS,
    MIN_MAX_TOKENS,
    MAX_MAX_TOKENS
  );
}

function normalizeApiBase(apiBase) {
  return String(apiBase || "")
    .trim()
    .replace(/\/+$/, "");
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

function copyTextToClipboard(text) {
  const clipboard = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
    .getService(Components.interfaces.nsIClipboardHelper);

  clipboard.copyString(text);
}
