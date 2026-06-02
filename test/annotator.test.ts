import { assert } from "chai";
import {
  buildPdfSortIndex,
  createAnnotations,
} from "../src/modules/annotator.ts";
import type { LLMResponse } from "../src/modules/llmClient.ts";
import type { ExtractionResult } from "../src/modules/pdfExtractor.ts";
import { ZPA_TAG } from "../src/modules/skipCheck.ts";

describe("createAnnotations", function () {
  let previousZotero: typeof Zotero | undefined;
  let parentItem: Zotero.Item | undefined;

  beforeEach(function () {
    previousZotero = globalThis.Zotero;
    installFakeZotero();
  });

  afterEach(async function () {
    if (parentItem?.id) {
      await parentItem.eraseTx();
      parentItem = undefined;
    }
    globalThis.Zotero = previousZotero as typeof Zotero;
  });

  it("builds Zotero-compatible PDF annotation sort indexes", function () {
    const sortIndex = buildPdfSortIndex(
      8,
      [[48.258, 339.06, 278.667, 347.1]],
      12,
    );

    assert.strictEqual(sortIndex, "00008|000012|00339");
  });

  it("marks summary-only output and reuses the existing ZPA summary note", async function () {
    parentItem = new Zotero.Item("journalArticle");
    parentItem.setField("title", "ZPA summary-only regression");
    await parentItem.saveTx();

    const extraction: ExtractionResult = {
      fullText: "",
      pages: [],
    };
    const response: LLMResponse = {
      summary: "This paper has a concise contribution.",
      annotations: [],
    };

    const firstResult = await createAnnotations(
      parentItem,
      0,
      extraction,
      response,
    );
    await parentItem.loadAllData(true);

    assert.equal(firstResult.created, 0);
    assert.isTrue(firstResult.summaryNoteCreated);
    assert.isTrue(parentItem.getTags().some((tag) => tag.tag === ZPA_TAG));
    assert.lengthOf(parentItem.getNotes(), 1);

    const secondResult = await createAnnotations(parentItem, 0, extraction, {
      ...response,
      summary: "Updated summary text.",
    });
    await parentItem.loadAllData(true);

    const noteIDs = parentItem.getNotes();
    const summaryNote = await globalThis.Zotero.Items.getAsync(noteIDs[0]);

    assert.isFalse(secondResult.summaryNoteCreated);
    assert.lengthOf(noteIDs, 1);
    assert.include(summaryNote.getNote(), "Updated summary text.");
  });
});

function installFakeZotero(): void {
  let nextItemID = 1;
  const items = new Map<number, FakeItem>();

  class FakeItem {
    id = 0;
    parentID?: number;
    private fields = new Map<string, string>();
    private tags: Array<{ tag: string }> = [];
    private note = "";
    private noteIDs: number[] = [];

    constructor(private readonly itemType: string) {}

    setField(field: string, value: string): void {
      this.fields.set(field, value);
    }

    setNote(note: string): void {
      this.note = note;
    }

    getNote(): string {
      return this.note;
    }

    getNoteTitle(): string {
      const titleMatch = this.note.match(/<h2>(.*?)<\/h2>/);
      return titleMatch?.[1] ?? this.fields.get("title") ?? this.itemType;
    }

    getNotes(): number[] {
      return [...this.noteIDs];
    }

    getTags(): Array<{ tag: string }> {
      return [...this.tags];
    }

    addTag(tag: string): void {
      if (!this.tags.some((existing) => existing.tag === tag)) {
        this.tags.push({ tag });
      }
    }

    async loadAllData(): Promise<void> {}

    async saveTx(): Promise<number> {
      if (!this.id) {
        this.id = nextItemID++;
        items.set(this.id, this);

        if (this.parentID) {
          items.get(this.parentID)?.noteIDs.push(this.id);
        }
      }

      return this.id;
    }

    async eraseTx(): Promise<void> {
      items.delete(this.id);
      this.id = 0;
    }
  }

  globalThis.Zotero = {
    Item: FakeItem,
    Items: {
      getAsync: async (itemID: number) => items.get(itemID),
    },
    debug: () => undefined,
  } as unknown as typeof Zotero;
}
