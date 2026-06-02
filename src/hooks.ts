import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { runPipeline } from "./modules/pipeline";
import { registerPrefsScripts } from "./modules/preferenceScript";

let notifierID: string | undefined;

async function waitForReadyReader(
  tabID: string,
): Promise<_ZoteroTypes.ReaderInstance | null> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const reader = Zotero.Reader.getByTabID(tabID);
    if (
      (reader as any)?._internalReader?._primaryView?._iframe?.contentWindow
    ) {
      return reader;
    }
    await Zotero.Promise.delay(500);
  }
  return null;
}

async function runPipelineForReader(
  reader: _ZoteroTypes.ReaderInstance,
): Promise<void> {
  try {
    await runPipeline(reader);
  } catch (err) {
    Zotero.debug(`[ZPA] Pipeline error: ${err}`);
  }
}

async function runPipelineForTab(tabID: string): Promise<void> {
  const reader = await waitForReadyReader(tabID);
  if (!reader) {
    ztoolkit.log("ZPA: Reader not ready after 10s, skipping");
    return;
  }

  await runPipelineForReader(reader);
}

async function runPipelineForExistingReaders(): Promise<void> {
  await Zotero.Promise.delay(2000);
  const readers = ((Zotero.Reader as any)._readers ??
    []) as _ZoteroTypes.ReaderInstance[];

  Zotero.debug(`[ZPA] Checking ${readers.length} existing reader(s)`);
  for (const reader of readers) {
    if (
      (reader as any)?._internalReader?._primaryView?._iframe?.contentWindow
    ) {
      await runPipelineForReader(reader);
    }
  }
}

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  // Register tab notifier to detect PDF opens
  notifierID = Zotero.Notifier.registerObserver(
    {
      notify: async (
        event: string,
        type: string,
        ids: Array<string | number>,
      ) => {
        if (type === "tab" && (event === "add" || event === "select")) {
          for (const id of ids) {
            await runPipelineForTab(String(id));
          }
        }
      },
    },
    ["tab"],
    "zpa-tab-notifier",
  );

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
  Zotero.debug("[ZPA] Plugin started");
  runPipelineForExistingReaders();
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  addon.data.ztoolkit = createZToolkit();

  win.MozXULElement.insertFTLIfNeeded(
    `${addon.data.config.addonRef}-mainWindow.ftl`,
  );
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  if (notifierID) {
    Zotero.Notifier.unregisterObserver(notifierID);
  }
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
  Zotero.debug("[ZPA] Plugin shut down");
}

async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent,
};
