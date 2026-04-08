import { config } from "../../package.json";
import { getPref, setPref } from "../utils/prefs";

export async function registerPrefsScripts(_window: Window) {
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
      columns: [],
      rows: [],
    };
  } else {
    addon.data.prefs.window = _window;
  }
  loadPrefsValues();
  bindPrefEvents();
}

function loadPrefsValues() {
  const doc = addon.data.prefs?.window.document;
  if (!doc) return;

  const setVal = (id: string, value: string | boolean) => {
    const el = doc.querySelector(`#${id}`);
    if (!el) return;
    if (el instanceof HTMLInputElement) {
      if (el.type === "checkbox") {
        el.checked = value as boolean;
      } else {
        el.value = String(value);
      }
    }
  };

  setVal(`zotero-prefpane-${config.addonRef}-apiKey`, getPref("apiKey"));
  setVal(
    `zotero-prefpane-${config.addonRef}-apiBaseUrl`,
    getPref("apiBaseUrl"),
  );
  setVal(
    `zotero-prefpane-${config.addonRef}-modelName`,
    getPref("modelName"),
  );
  setVal(
    `zotero-prefpane-${config.addonRef}-maxTokenThreshold`,
    String(getPref("maxTokenThreshold")),
  );
  setVal(
    `zotero-prefpane-${config.addonRef}-autoAnnotate`,
    getPref("autoAnnotate"),
  );
}

function bindPrefEvents() {
  const doc = addon.data.prefs?.window.document;
  if (!doc) return;

  const bindInput = (
    id: string,
    prefKey: keyof _ZoteroTypes.Prefs["PluginPrefsMap"],
    type: "string" | "number" | "boolean" = "string",
  ) => {
    const el = doc.querySelector(`#${id}`);
    if (!el) return;

    const eventType =
      el instanceof HTMLInputElement && el.type === "checkbox"
        ? "change"
        : "change";

    el.addEventListener(eventType, (e: Event) => {
      const target = e.target as HTMLInputElement;
      let value: any;
      if (type === "boolean") {
        value = target.checked;
      } else if (type === "number") {
        value = parseInt(target.value, 10);
      } else {
        value = target.value;
      }
      setPref(prefKey, value);
    });
  };

  bindInput(
    `zotero-prefpane-${config.addonRef}-apiKey`,
    "apiKey",
    "string",
  );
  bindInput(
    `zotero-prefpane-${config.addonRef}-apiBaseUrl`,
    "apiBaseUrl",
    "string",
  );
  bindInput(
    `zotero-prefpane-${config.addonRef}-modelName`,
    "modelName",
    "string",
  );
  bindInput(
    `zotero-prefpane-${config.addonRef}-maxTokenThreshold`,
    "maxTokenThreshold",
    "number",
  );
  bindInput(
    `zotero-prefpane-${config.addonRef}-autoAnnotate`,
    "autoAnnotate",
    "boolean",
  );
}
