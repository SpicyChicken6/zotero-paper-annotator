import { assert } from "chai";
import { config } from "../package.json";
import { registerPrefsScripts } from "../src/modules/preferenceScript.ts";
import { DEFAULT_PREFS } from "../src/utils/prefs.ts";
import { DEFAULT_MAX_TOKEN_THRESHOLD } from "../src/utils/tokenEstimator.ts";

type Listener = (event: { target: FakeControl }) => void;

type FakeControl = {
  type?: string;
  value?: string;
  checked?: boolean;
  addEventListener: (eventType: string, listener: Listener) => void;
  dispatchChange: () => void;
  listenerCount: () => number;
};

function createControl({
  type,
  value,
  checked,
}: {
  type?: string;
  value?: string;
  checked?: boolean;
}): FakeControl {
  const listeners: Listener[] = [];
  const control: FakeControl = {
    type,
    value,
    checked,
    addEventListener(eventType, listener) {
      if (eventType === "change") {
        listeners.push(listener);
      }
    },
    dispatchChange() {
      for (const listener of listeners) {
        listener({ target: control });
      }
    },
    listenerCount() {
      return listeners.length;
    },
  };
  return control;
}

function prefId(key: string) {
  return `zotero-prefpane-${config.addonRef}-${key}`;
}

function createPrefsWindow() {
  const controls = {
    apiKey: createControl({ type: "password", value: "" }),
    apiBaseUrl: createControl({ type: "text", value: "" }),
    modelName: createControl({ type: "text", value: "" }),
    maxTokenThreshold: createControl({ type: "number", value: "" }),
    minParagraphChars: createControl({ type: "number", value: "" }),
    autoAnnotate: createControl({ checked: false }),
  };
  const byId = new Map<string, FakeControl>([
    [prefId("apiKey"), controls.apiKey],
    [prefId("apiBaseUrl"), controls.apiBaseUrl],
    [prefId("modelName"), controls.modelName],
    [prefId("maxTokenThreshold"), controls.maxTokenThreshold],
    [prefId("minParagraphChars"), controls.minParagraphChars],
    [prefId("autoAnnotate"), controls.autoAnnotate],
  ]);
  const prefs = new Map<string, string | number | boolean>([
    [`${config.prefsPrefix}.apiKey`, "sk-current"],
    [`${config.prefsPrefix}.apiBaseUrl`, "https://api.example.test/v1"],
    [`${config.prefsPrefix}.modelName`, "example-model"],
    [`${config.prefsPrefix}.maxTokenThreshold`, 42000],
    [`${config.prefsPrefix}.minParagraphChars`, 180],
    [`${config.prefsPrefix}.autoAnnotate`, true],
  ]);
  const setCalls: { key: string; value: string | number | boolean }[] = [];

  return {
    controls,
    setCalls,
    prefs,
    window: {
      document: {
        querySelector(selector: string) {
          return byId.get(selector.replace(/^#/, "")) ?? null;
        },
      },
    },
  };
}

describe("preferenceScript", function () {
  let previousAddon: unknown;
  let previousZotero: unknown;
  let hadHTMLInputElement: boolean;

  beforeEach(function () {
    previousAddon = globalThis.addon;
    previousZotero = globalThis.Zotero;
    hadHTMLInputElement = "HTMLInputElement" in globalThis;

    if (!hadHTMLInputElement) {
      Object.defineProperty(globalThis, "HTMLInputElement", {
        configurable: true,
        value: class HTMLInputElement {},
      });
    }
  });

  afterEach(function () {
    globalThis.addon = previousAddon as typeof addon;
    globalThis.Zotero = previousZotero as typeof Zotero;

    if (!hadHTMLInputElement) {
      Reflect.deleteProperty(globalThis, "HTMLInputElement");
    }
  });

  function installPrefs(prefsWindow: ReturnType<typeof createPrefsWindow>) {
    globalThis.addon = { data: {} } as typeof addon;
    globalThis.Zotero = {
      Prefs: {
        get(key: string) {
          return prefsWindow.prefs.get(key);
        },
        set(key: string, value: string | number | boolean) {
          prefsWindow.setCalls.push({ key, value });
          prefsWindow.prefs.set(key, value);
        },
      },
    } as typeof Zotero;
  }

  it("loads preference values using control shape instead of constructors", async function () {
    const prefsWindow = createPrefsWindow();
    installPrefs(prefsWindow);

    await registerPrefsScripts(prefsWindow.window as unknown as Window);

    assert.equal(prefsWindow.controls.apiKey.value, "sk-current");
    assert.equal(
      prefsWindow.controls.apiBaseUrl.value,
      "https://api.example.test/v1",
    );
    assert.equal(prefsWindow.controls.modelName.value, "example-model");
    assert.equal(prefsWindow.controls.maxTokenThreshold.value, "42000");
    assert.equal(prefsWindow.controls.minParagraphChars.value, "180");
    assert.isTrue(prefsWindow.controls.autoAnnotate.checked);
  });

  it("loads code defaults when Zotero has not materialized default prefs", async function () {
    const prefsWindow = createPrefsWindow();
    installPrefs(prefsWindow);
    prefsWindow.prefs.clear();
    prefsWindow.prefs.set(`${config.prefsPrefix}.apiKey`, "sk-current");

    await registerPrefsScripts(prefsWindow.window as unknown as Window);

    assert.equal(prefsWindow.controls.apiKey.value, "sk-current");
    assert.equal(
      prefsWindow.controls.apiBaseUrl.value,
      DEFAULT_PREFS.apiBaseUrl,
    );
    assert.equal(prefsWindow.controls.modelName.value, DEFAULT_PREFS.modelName);
    assert.equal(
      prefsWindow.controls.maxTokenThreshold.value,
      String(DEFAULT_PREFS.maxTokenThreshold),
    );
    assert.equal(
      prefsWindow.controls.minParagraphChars.value,
      String(DEFAULT_PREFS.minParagraphChars),
    );
    assert.equal(
      prefsWindow.controls.autoAnnotate.checked,
      DEFAULT_PREFS.autoAnnotate,
    );
  });

  it("does not add duplicate listeners when the same pane loads twice", async function () {
    const prefsWindow = createPrefsWindow();
    installPrefs(prefsWindow);

    await registerPrefsScripts(prefsWindow.window as unknown as Window);
    await registerPrefsScripts(prefsWindow.window as unknown as Window);

    prefsWindow.setCalls.length = 0;
    prefsWindow.controls.autoAnnotate.checked = false;
    prefsWindow.controls.autoAnnotate.dispatchChange();

    assert.equal(prefsWindow.controls.autoAnnotate.listenerCount(), 1);
    assert.deepEqual(prefsWindow.setCalls, [
      {
        key: `${config.prefsPrefix}.autoAnnotate`,
        value: false,
      },
    ]);
  });

  it("normalizes a blank threshold field before saving", async function () {
    const prefsWindow = createPrefsWindow();
    installPrefs(prefsWindow);

    await registerPrefsScripts(prefsWindow.window as unknown as Window);

    prefsWindow.setCalls.length = 0;
    prefsWindow.controls.maxTokenThreshold.value = "";
    prefsWindow.controls.maxTokenThreshold.dispatchChange();

    assert.equal(
      prefsWindow.controls.maxTokenThreshold.value,
      String(DEFAULT_MAX_TOKEN_THRESHOLD),
    );
    assert.deepEqual(prefsWindow.setCalls, [
      {
        key: `${config.prefsPrefix}.maxTokenThreshold`,
        value: DEFAULT_MAX_TOKEN_THRESHOLD,
      },
    ]);
  });

  it("saves minimum paragraph length changes as a number", async function () {
    const prefsWindow = createPrefsWindow();
    installPrefs(prefsWindow);

    await registerPrefsScripts(prefsWindow.window as unknown as Window);

    prefsWindow.setCalls.length = 0;
    prefsWindow.controls.minParagraphChars.value = "240";
    prefsWindow.controls.minParagraphChars.dispatchChange();

    assert.deepEqual(prefsWindow.setCalls, [
      {
        key: `${config.prefsPrefix}.minParagraphChars`,
        value: 240,
      },
    ]);
  });
});
