import { config } from "../../package.json";

type PluginPrefsMap = _ZoteroTypes.Prefs["PluginPrefsMap"];

const PREFS_PREFIX = config.prefsPrefix;
const DEFAULT_PREFS: PluginPrefsMap = {
  apiKey: "",
  apiBaseUrl: "https://openrouter.ai/api",
  modelName: "deepseek/deepseek-v4-flash",
  maxTokenThreshold: 120000,
  minParagraphChars: 180,
  autoAnnotate: true,
  colorKeyFinding: "#ffd400",
  colorMethodology: "#2ea8e5",
  colorConclusion: "#5fb236",
  colorLimitation: "#f19837",
};

/**
 * Get preference value.
 * Wrapper of `Zotero.Prefs.get`.
 * @param key
 */
export function getPref<K extends keyof PluginPrefsMap>(key: K) {
  const value = Zotero.Prefs.get(`${PREFS_PREFIX}.${key}`, true);
  return (value ?? DEFAULT_PREFS[key]) as PluginPrefsMap[K];
}

/**
 * Set preference value.
 * Wrapper of `Zotero.Prefs.set`.
 * @param key
 * @param value
 */
export function setPref<K extends keyof PluginPrefsMap>(
  key: K,
  value: PluginPrefsMap[K],
) {
  return Zotero.Prefs.set(`${PREFS_PREFIX}.${key}`, value, true);
}

/**
 * Clear preference value.
 * Wrapper of `Zotero.Prefs.clear`.
 * @param key
 */
export function clearPref(key: string) {
  return Zotero.Prefs.clear(`${PREFS_PREFIX}.${key}`, true);
}

export { DEFAULT_PREFS };
