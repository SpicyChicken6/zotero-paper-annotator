import { isAlreadyAnnotated } from "./skipCheck";
import { getPref } from "../utils/prefs";
import { extractText } from "./pdfExtractor";
import { callLLM } from "./llmClient";
import { createAnnotations } from "./annotator";
import { exceedsTokenLimit } from "../utils/tokenEstimator";
import type { AnnotationResult } from "./annotator";
import { config } from "../../package.json";

const inProgressItems = new Set<number>();

interface PipelineItemScope {
  stateItem: Zotero.Item;
  stateItemID: number;
  noteParent: Zotero.Item;
}

function resolvePipelineItemScope(attachment: Zotero.Item): PipelineItemScope {
  return {
    stateItem: attachment,
    stateItemID: attachment.id,
    noteParent: attachment.parentItem ?? attachment,
  };
}

/**
 * Run the full annotation pipeline for a reader instance.
 * Returns null if the paper was skipped, or an AnnotationResult if annotated.
 */
async function runPipeline(
  reader: _ZoteroTypes.ReaderInstance,
): Promise<AnnotationResult | null> {
  // Check if auto-annotate is enabled
  if (!getPref("autoAnnotate")) {
    Zotero.debug("[ZPA] Auto-annotate is disabled, skipping");
    return null;
  }

  // Check if API key is configured
  const apiKey = getPref("apiKey");
  if (!apiKey || apiKey.length === 0) {
    showNotification(
      "No API key configured. Go to Tools → Add-ons → ZPA Preferences.",
    );
    return null;
  }

  // Get the item from the reader
  const itemID = (reader as any).itemID;
  if (!itemID) {
    Zotero.debug("[ZPA] Could not get item ID from reader");
    return null;
  }

  const attachment = await Zotero.Items.getAsync(itemID);
  if (!attachment) {
    Zotero.debug("[ZPA] Could not get attachment item");
    return null;
  }

  const itemScope = resolvePipelineItemScope(attachment);

  // Race condition guard: skip if pipeline is already running for this PDF.
  if (inProgressItems.has(itemScope.stateItemID)) {
    ztoolkit.log("ZPA: Pipeline already running for this PDF, skipping");
    return null;
  }
  inProgressItems.add(itemScope.stateItemID);
  try {
    // Skip check
    if (isAlreadyAnnotated(itemScope.stateItem)) {
      Zotero.debug("[ZPA] PDF already annotated, skipping");
      return null;
    }

    // Extract text
    let extraction;
    try {
      extraction = await extractText(reader);
    } catch (err) {
      Zotero.debug(`[ZPA] Text extraction failed: ${err}`);
      showNotification("Could not extract text from PDF.");
      return null;
    }

    // Check token limit
    const maxTokens = getPref("maxTokenThreshold");
    if (exceedsTokenLimit(extraction.fullText, maxTokens)) {
      showNotification("Paper too long to annotate.");
      return null;
    }

    // Call LLM
    showNotification("Annotating paper...");
    let llmResponse;
    try {
      llmResponse = await callLLM(extraction.fullText);
    } catch (err) {
      Zotero.debug(`[ZPA] LLM call failed: ${err}`);
      showNotification(`Annotation failed — ${err}`);
      return null;
    }

    // Create annotations
    let result;
    try {
      result = await createAnnotations(
        itemScope.noteParent,
        attachment.id,
        extraction,
        llmResponse,
        itemScope.stateItem,
      );
    } catch (err) {
      ztoolkit.log(`ZPA: Error creating annotations: ${err}`);
      new ztoolkit.ProgressWindow("Paper Annotator")
        .createLine({ text: "Error creating annotations", type: "fail" })
        .show();
      return null;
    }

    showNotification(
      `Created ${result.created} annotations (${result.skipped} skipped).`,
    );
    return result;
  } finally {
    inProgressItems.delete(itemScope.stateItemID);
  }
}

function showNotification(message: string): void {
  try {
    new ztoolkit.ProgressWindow(config.addonName, {
      closeOnClick: true,
      closeTime: 5000,
    })
      .createLine({ text: message, type: "default" })
      .show();
  } catch {
    Zotero.debug(`[ZPA] ${message}`);
  }
}

export { resolvePipelineItemScope, runPipeline };
