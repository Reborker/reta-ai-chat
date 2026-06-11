/* global Zotero, Services, Components */

var ADDON_ID = "reta-ai-chat@euclpts.com";
var PREF_API_KEY = "extensions.retaAIChat.apiKey";
var PREF_MODEL = "extensions.retaAIChat.model";
var PREF_INCLUDE_FULL_TEXT = "extensions.retaAIChat.includeFullText";
var PREF_API_BASE = "extensions.retaAIChat.apiBase";
var PREF_PDF_MAX_CHARS = "extensions.retaAIChat.pdfMaxChars";
var PREF_MAX_TOKENS = "extensions.retaAIChat.maxTokens";

var DEFAULT_PDF_MAX_CHARS = 120000;
var DEFAULT_MAX_TOKENS = 3000;
var MIN_PDF_MAX_CHARS = 1000;
var MAX_PDF_MAX_CHARS = 1000000;
var MIN_MAX_TOKENS = 100;
var MAX_MAX_TOKENS = 64000;
