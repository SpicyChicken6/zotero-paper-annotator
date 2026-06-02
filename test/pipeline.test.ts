import { assert } from "chai";
import {
  prepareParagraphLLMInput,
  resolvePipelineItemScope,
} from "../src/modules/pipeline.ts";
import type { ExtractionResult } from "../src/modules/pdfExtractor.ts";

function itemWithParent(id: number, parentItem?: Zotero.Item): Zotero.Item {
  return { id, parentItem } as Zotero.Item;
}

describe("pipeline item scoping", function () {
  let previousZotero: typeof Zotero;

  beforeEach(function () {
    previousZotero = globalThis.Zotero;
    globalThis.Zotero = {
      Prefs: {
        get(key: string) {
          if (key.endsWith("minParagraphChars")) return 80;
          return undefined;
        },
      },
    } as typeof Zotero;
  });

  afterEach(function () {
    globalThis.Zotero = previousZotero;
  });

  it("tracks processed state by attachment while placing summary notes on the parent item", function () {
    const parentItem = itemWithParent(10);
    const attachment = itemWithParent(20, parentItem);

    const scope = resolvePipelineItemScope(attachment);

    assert.strictEqual(scope.stateItem, attachment);
    assert.strictEqual(scope.stateItemID, attachment.id);
    assert.strictEqual(scope.noteParent, parentItem);
  });

  it("uses a standalone attachment for both processed state and summary notes", function () {
    const attachment = itemWithParent(30);

    const scope = resolvePipelineItemScope(attachment);

    assert.strictEqual(scope.stateItem, attachment);
    assert.strictEqual(scope.stateItemID, attachment.id);
    assert.strictEqual(scope.noteParent, attachment);
  });

  it("prepares filtered paragraph input for the LLM", function () {
    const extraction: ExtractionResult = {
      fullText: "ignored full text",
      pages: [],
      paragraphs: [
        {
          id: "p0001",
          pageIndex: 0,
          pageLabel: "1",
          indexOnPage: 0,
          text: "Short heading",
          items: [{ str: "Short", x: 1, y: 2, width: 5, height: 2 }],
        },
        {
          id: "p0002",
          pageIndex: 0,
          pageLabel: "1",
          indexOnPage: 1,
          text: "This paragraph is substantial because it contains enough contextual detail for a useful summary.",
          items: [
            { str: "This", x: 1, y: 2, width: 4, height: 2 },
            { str: "paragraph", x: 6, y: 2, width: 9, height: 2 },
          ],
        },
      ],
    };

    const input = prepareParagraphLLMInput(extraction);

    assert.notInclude(input, "Short heading");
    assert.include(input, "[Paragraph p0002 | Page 1]");
    assert.include(input, "enough contextual detail");
  });
});
