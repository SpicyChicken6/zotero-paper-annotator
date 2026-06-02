import { assert } from "chai";
import {
  extractText,
  textItemsFromZoteroPageData,
} from "../src/modules/pdfExtractor.ts";

function readerForDocument(pdfDocument: any) {
  return {
    _internalReader: {
      _primaryView: {
        _iframe: {
          contentWindow: {
            PDFViewerApplication: { pdfDocument },
          },
        },
      },
    },
  } as _ZoteroTypes.ReaderInstance;
}

describe("pdfExtractor", function () {
  afterEach(function () {
    delete (globalThis as any).Components;
  });

  it("builds text items from Zotero 9 page character data", function () {
    const items = textItemsFromZoteroPageData({
      chars: [
        { c: "K", inlineRect: [1, 2, 2, 4] },
        { c: "e", inlineRect: [2, 2, 3, 4] },
        { c: "y", inlineRect: [3, 2, 4, 4], spaceAfter: true },
        { c: "f", inlineRect: [6, 2, 7, 4] },
        { c: "i", inlineRect: [7, 2, 8, 4] },
        { c: "n", inlineRect: [8, 2, 9, 4] },
        { c: "d", inlineRect: [9, 2, 10, 4] },
        { c: "i", inlineRect: [10, 2, 11, 4] },
        { c: "n", inlineRect: [11, 2, 12, 4] },
        { c: "g", inlineRect: [12, 2, 13, 4], lineBreakAfter: true },
      ],
    });

    assert.deepEqual(items, [
      { str: "Key", x: 1, y: 2, width: 3, height: 2 },
      { str: "finding", x: 6, y: 2, width: 7, height: 2 },
    ]);
  });

  it("extracts text via Zotero 9 getPageData before using PDF.js pages", async function () {
    const pdfDocument = {
      numPages: 1,
      getPageLabels2: async () => ["iii"],
      getPageData: async ({ pageIndex }: { pageIndex: number }) => {
        assert.strictEqual(pageIndex, 0);
        return {
          chars: [
            { c: "M", inlineRect: [1, 2, 2, 4] },
            { c: "a", inlineRect: [2, 2, 3, 4] },
            { c: "i", inlineRect: [3, 2, 4, 4] },
            { c: "n", inlineRect: [4, 2, 5, 4], spaceAfter: true },
            { c: "r", inlineRect: [7, 2, 8, 4] },
            { c: "e", inlineRect: [8, 2, 9, 4] },
            { c: "s", inlineRect: [9, 2, 10, 4] },
            { c: "u", inlineRect: [10, 2, 11, 4] },
            { c: "l", inlineRect: [11, 2, 12, 4] },
            { c: "t", inlineRect: [12, 2, 13, 4] },
          ],
        };
      },
      getPage: async () => {
        throw new Error("PDF.js fallback should not run");
      },
    };

    const result = await extractText(readerForDocument(pdfDocument));

    assert.strictEqual(result.fullText, "[Page iii]\nMain result");
    assert.deepEqual(result.pages[0], {
      pageIndex: 0,
      pageLabel: "iii",
      text: "Main result",
      items: [
        { str: "Main", x: 1, y: 2, width: 4, height: 2 },
        { str: "result", x: 7, y: 2, width: 6, height: 2 },
      ],
      paragraphs: [
        {
          id: "p0001",
          pageIndex: 0,
          pageLabel: "iii",
          indexOnPage: 0,
          text: "Main result",
          items: [
            { str: "Main", x: 1, y: 2, width: 4, height: 2 },
            { str: "result", x: 7, y: 2, width: 6, height: 2 },
          ],
        },
      ],
    });
  });

  it("groups Zotero 9 page character data into stable paragraphs", async function () {
    const pdfDocument = {
      numPages: 1,
      getPageData: async () => ({
        chars: [
          { c: "F", inlineRect: [1, 2, 2, 4] },
          { c: "i", inlineRect: [2, 2, 3, 4] },
          { c: "r", inlineRect: [3, 2, 4, 4] },
          { c: "s", inlineRect: [4, 2, 5, 4] },
          { c: "t", inlineRect: [5, 2, 6, 4], spaceAfter: true },
          { c: "p", inlineRect: [8, 2, 9, 4] },
          { c: "a", inlineRect: [9, 2, 10, 4] },
          { c: "r", inlineRect: [10, 2, 11, 4] },
          { c: "a", inlineRect: [11, 2, 12, 4] },
          { c: ".", inlineRect: [12, 2, 13, 4], paragraphBreakAfter: true },
          { c: "S", inlineRect: [1, 8, 2, 10] },
          { c: "e", inlineRect: [2, 8, 3, 10] },
          { c: "c", inlineRect: [3, 8, 4, 10] },
          { c: "o", inlineRect: [4, 8, 5, 10] },
          { c: "n", inlineRect: [5, 8, 6, 10] },
          { c: "d", inlineRect: [6, 8, 7, 10], spaceAfter: true },
          { c: "p", inlineRect: [9, 8, 10, 10] },
          { c: "a", inlineRect: [10, 8, 11, 10] },
          { c: "r", inlineRect: [11, 8, 12, 10] },
          { c: "a", inlineRect: [12, 8, 13, 10] },
          { c: ".", inlineRect: [13, 8, 14, 10] },
        ],
      }),
    };

    const result = await extractText(readerForDocument(pdfDocument));

    assert.deepEqual(
      result.paragraphs.map((paragraph) => ({
        id: paragraph.id,
        pageLabel: paragraph.pageLabel,
        indexOnPage: paragraph.indexOnPage,
        text: paragraph.text,
        itemTexts: paragraph.items.map((item) => item.str),
      })),
      [
        {
          id: "p0001",
          pageLabel: "1",
          indexOnPage: 0,
          text: "First para.",
          itemTexts: ["First", "para."],
        },
        {
          id: "p0002",
          pageLabel: "1",
          indexOnPage: 1,
          text: "Second para.",
          itemTexts: ["Second", "para."],
        },
      ],
    );
    assert.deepEqual(
      result.pages[0].paragraphs.map((paragraph) => paragraph.id),
      ["p0001", "p0002"],
    );
  });

  it("clones getPageData arguments into the reader iframe compartment", async function () {
    const iframeWindow = {
      compartmentName: "reader",
      PDFViewerApplication: {
        pdfDocument: {
          numPages: 1,
          getPageData: async (options: {
            pageIndex: number;
            clonedFor: string;
          }) => {
            assert.deepEqual(options, {
              pageIndex: 0,
              clonedFor: "reader",
            });
            return {
              chars: [{ c: "A", inlineRect: [1, 2, 3, 4] }],
            };
          },
        },
      },
    };
    (globalThis as any).Components = {
      utils: {
        cloneInto: (value: any, targetWindow: any) => ({
          ...value,
          clonedFor: targetWindow.compartmentName,
        }),
      },
    };
    const reader = {
      _internalReader: {
        _primaryView: {
          _iframe: {
            contentWindow: iframeWindow,
          },
        },
      },
    } as _ZoteroTypes.ReaderInstance;

    const result = await extractText(reader);

    assert.strictEqual(result.fullText, "[Page 1]\nA");
  });

  it("keeps the legacy PDF.js text extraction fallback", async function () {
    const pdfDocument = {
      numPages: 1,
      getPage: async (pageNumber: number) => {
        assert.strictEqual(pageNumber, 1);
        return {
          getTextContent: async () => ({
            items: [
              {
                str: "Legacy",
                transform: [1, 0, 0, 1, 10, 20],
                width: 30,
                height: 8,
              },
            ],
          }),
        };
      },
    };

    const result = await extractText(readerForDocument(pdfDocument));

    assert.strictEqual(result.fullText, "[Page 1]\nLegacy");
    assert.deepEqual(result.pages[0].items, [
      { str: "Legacy", x: 10, y: 20, width: 30, height: 8 },
    ]);
  });
});
