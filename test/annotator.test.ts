import { assert } from "chai";
import {
  buildPdfSortIndex,
  createAnnotations,
} from "../src/modules/annotator.ts";
import type { LLMResponse } from "../src/modules/llmClient.ts";
import type { ExtractionResult } from "../src/modules/pdfExtractor.ts";
import { ZPA_PARAGRAPH_TAG, ZPA_TAG } from "../src/modules/skipCheck.ts";

describe("createAnnotations", function () {
  let previousZotero: typeof Zotero | undefined;
  let parentItem: Zotero.Item | undefined;
  let savedAnnotations: any[];

  beforeEach(function () {
    previousZotero = globalThis.Zotero;
    savedAnnotations = [];
    installFakeZotero(savedAnnotations);
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

  it("matches paragraph-ID annotations against paragraph text and marks the paragraph tag", async function () {
    parentItem = new Zotero.Item("journalArticle");
    parentItem.setField("title", "ZPA paragraph annotation regression");
    await parentItem.saveTx();

    const attachment = new Zotero.Item("attachment");
    await attachment.saveTx();

    const paragraphItems = [
      { str: "The", x: 1, y: 2, width: 3, height: 2 },
      { str: "important", x: 5, y: 2, width: 9, height: 2 },
      { str: "method", x: 15, y: 2, width: 6, height: 2 },
      { str: "works.", x: 22, y: 2, width: 6, height: 2 },
    ];
    const paragraph = {
      id: "p0001",
      pageIndex: 0,
      pageLabel: "1",
      indexOnPage: 0,
      text: "The important method works.",
      items: paragraphItems,
    };
    const extraction: ExtractionResult = {
      fullText: "",
      pages: [
        {
          pageIndex: 0,
          pageLabel: "1",
          text: paragraph.text,
          items: paragraphItems,
          paragraphs: [paragraph],
        },
      ],
      paragraphs: [paragraph],
    };
    const response: LLMResponse = {
      summary: "The paper introduces a method.",
      annotations: [
        {
          paragraphId: "p0001",
          page: 99,
          quote: "important method",
          category: "methodology",
          note: "This paragraph summarizes the core method.",
        },
      ],
    };

    const result = await createAnnotations(
      parentItem,
      attachment.id,
      extraction,
      response,
      attachment,
      ZPA_PARAGRAPH_TAG,
    );

    assert.equal(result.created, 1);
    assert.lengthOf(savedAnnotations, 1);
    assert.equal(savedAnnotations[0].text, "important method");
    assert.equal(savedAnnotations[0].pageLabel, "1");
    assert.deepEqual(savedAnnotations[0].position.pageIndex, 0);
    assert.isTrue(
      attachment.getTags().some((tag) => tag.tag === ZPA_PARAGRAPH_TAG),
    );
  });
});

function installFakeZotero(savedAnnotations: any[]): void {
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
    DataObjectUtilities: {
      generateKey: () => "ABCD1234",
    },
    Utilities: {
      randomString: () => "RANDOM12",
    },
    Annotations: {
      saveFromJSON: async (_attachment: FakeItem, annotationJSON: any) => {
        savedAnnotations.push(annotationJSON);
      },
    },
    Prefs: {
      get: (key: string) => {
        if (key.endsWith("colorMethodology")) return "#2ea8e5";
        if (key.endsWith("colorConclusion")) return "#5fb236";
        if (key.endsWith("colorLimitation")) return "#f19837";
        return "#ffd400";
      },
    },
    debug: () => undefined,
  } as unknown as typeof Zotero;
}
