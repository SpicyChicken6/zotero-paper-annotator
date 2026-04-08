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
          // Delay to let the reader fully initialize
          await Zotero.Promise.delay(3000);

          for (const id of ids) {
            const reader = Zotero.Reader.getByTabID(String(id));
            if (reader) {
              try {
                await runPipeline(reader);
              } catch (err) {
                Zotero.debug(`[ZPA] Pipeline error: ${err}`);
              }
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

async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  // Tab events are handled by the notifier registered in onStartup
  ztoolkit.log("notify", event, type, ids, extraData);
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
  onNotify,
  onPrefsEvent,
};
