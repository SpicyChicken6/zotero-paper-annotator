import { config } from "../../package.json";
import { getPref, setPref } from "../utils/prefs";
import { normalizeMaxTokenThreshold } from "../utils/tokenEstimator";

type PluginPrefsMap = _ZoteroTypes.Prefs["PluginPrefsMap"];
type PrefValueType = "string" | "number" | "boolean";
type ValueControl = Element & { value: string };
type CheckedControl = Element & { checked: boolean };

const boundPrefControls = new WeakSet<Element>();

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

function hasValue(el: Element): el is ValueControl {
  return "value" in el;
}

function hasChecked(el: Element): el is CheckedControl {
  return "checked" in el;
}

function readControlValue(el: Element, type: PrefValueType) {
  if (type === "boolean") {
    return hasChecked(el) ? el.checked : undefined;
  }

  if (!hasValue(el)) {
    return undefined;
  }

  if (type === "number") {
    const value = normalizeMaxTokenThreshold(el.value);
    el.value = String(value);
    return value;
  }

  return el.value;
}

function loadPrefsValues() {
  const doc = addon.data.prefs?.window.document;
  if (!doc) return;

  const setVal = (id: string, value: string | boolean) => {
    const el = doc.querySelector(`#${id}`);
    if (!el) return;

    if (typeof value === "boolean") {
      if (hasChecked(el)) {
        el.checked = value;
      }
      return;
    }

    if (hasValue(el)) {
      el.value = String(value);
    }
  };

  setVal(`zotero-prefpane-${config.addonRef}-apiKey`, getPref("apiKey"));
  setVal(
    `zotero-prefpane-${config.addonRef}-apiBaseUrl`,
    getPref("apiBaseUrl"),
  );
  setVal(`zotero-prefpane-${config.addonRef}-modelName`, getPref("modelName"));
  setVal(
    `zotero-prefpane-${config.addonRef}-maxTokenThreshold`,
    String(normalizeMaxTokenThreshold(getPref("maxTokenThreshold"))),
  );
  setVal(
    `zotero-prefpane-${config.addonRef}-minParagraphChars`,
    String(getPref("minParagraphChars")),
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
    prefKey: keyof PluginPrefsMap,
    type: PrefValueType = "string",
  ) => {
    const el = doc.querySelector(`#${id}`);
    if (!el) return;
    if (boundPrefControls.has(el)) return;

    boundPrefControls.add(el);

    el.addEventListener("change", () => {
      const value = readControlValue(el, type);
      if (value === undefined) return;

      setPref(prefKey, value as PluginPrefsMap[typeof prefKey]);
    });
  };

  bindInput(`zotero-prefpane-${config.addonRef}-apiKey`, "apiKey", "string");
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
    `zotero-prefpane-${config.addonRef}-minParagraphChars`,
    "minParagraphChars",
    "number",
  );
  bindInput(
    `zotero-prefpane-${config.addonRef}-autoAnnotate`,
    "autoAnnotate",
    "boolean",
  );
}
