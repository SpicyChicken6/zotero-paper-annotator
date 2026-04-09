import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";
import { runPipeline } from "./modules/pipeline";
import { registerPrefsScripts } from "./modules/preferenceScript";

let notifierID: string | undefined;

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
        if (type === "tab" && event === "add") {
          for (const id of ids) {
            // Poll until the reader is fully initialized
            let reader = null;
            for (let attempt = 0; attempt < 20; attempt++) {
              reader = Zotero.Reader.getByTabID(String(id));
              if (
                (reader as any)?._internalReader?._primaryView?._iframe
                  ?.contentWindow
              )
                break;
              reader = null;
              await Zotero.Promise.delay(500);
            }
            if (!reader) {
              ztoolkit.log("ZPA: Reader not ready after 10s, skipping");
              continue;
            }
            try {
              await runPipeline(reader);
            } catch (err) {
              Zotero.debug(`[ZPA] Pipeline error: ${err}`);
            }
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
