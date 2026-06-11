/* global Zotero, Services, MozXULElement */

var rootURIGlobal = "";
var registeredSectionID = null;
var bootstrapScope = this;

function install() {}

function uninstall() {}

function loadModule(path) {
  Services.scriptloader.loadSubScript(rootURIGlobal + path, bootstrapScope);
}

function loadModules() {
  [
    "modules/constants.js",
    "modules/utils.js",
    "modules/markdown.js",
    "modules/settings.js",
    "modules/context.js",
    "modules/api.js",
    "modules/ui.js"
  ].forEach(loadModule);
}

function startup({ id, version, rootURI }, reason) {
  rootURIGlobal = rootURI;

  loadModules();

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
    win.document.querySelector('[href="reta-ai-chat.ftl"]')?.remove();
  }

  Zotero.debug("[AI Chat] shutdown");
}

function onMainWindowLoad({ window }) {
  window.MozXULElement.insertFTLIfNeeded("reta-ai-chat.ftl");
}

function onMainWindowUnload({ window }) {
  window.document.querySelector('[href="reta-ai-chat.ftl"]')?.remove();
}
