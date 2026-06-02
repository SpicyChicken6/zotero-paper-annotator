import { assert } from "chai";
import {
  formatParagraphsForLLM,
  getSubstantialParagraphs,
} from "../src/modules/paragraphs.ts";
import type {
  ExtractionResult,
  ParagraphText,
  TextItem,
} from "../src/modules/pdfExtractor.ts";

function item(str: string): TextItem {
  return { str, x: 1, y: 2, width: str.length, height: 2 };
}

function paragraph(
  id: string,
  text: string,
  pageIndex: number,
  indexOnPage: number,
): ParagraphText {
  return {
    id,
    pageIndex,
    pageLabel: String(pageIndex + 1),
    indexOnPage,
    text,
    items: text.split(/\s+/).map(item),
  };
}

describe("paragraph helpers", function () {
  it("filters out short fragments while preserving substantial paragraph order", function () {
    const extraction = {
      fullText: "",
      pages: [],
      paragraphs: [
        paragraph("p0001", "Short heading", 0, 0),
        paragraph(
          "p0002",
          "This substantial paragraph explains the paper contribution with enough detail to deserve a contextual summary.",
          0,
          1,
        ),
        paragraph(
          "p0003",
          "Another substantial paragraph describes the method and connects it to the broader paper argument.",
          1,
          0,
        ),
      ],
    } as ExtractionResult;

    const substantial = getSubstantialParagraphs(extraction, 80);

    assert.deepEqual(
      substantial.map((entry) => entry.id),
      ["p0002", "p0003"],
    );
  });

  it("formats paragraph IDs and page labels for whole-paper LLM input", function () {
    const paragraphs = [
      paragraph(
        "p0002",
        "This paragraph explains the core method in the paper.",
        0,
        1,
      ),
      paragraph(
        "p0003",
        "This paragraph explains why the result matters clinically.",
        1,
        0,
      ),
    ];

    const formatted = formatParagraphsForLLM(paragraphs);

    assert.include(formatted, "[Paragraph p0002 | Page 1]");
    assert.include(formatted, "This paragraph explains the core method");
    assert.include(formatted, "[Paragraph p0003 | Page 2]");
    assert.include(formatted, "This paragraph explains why the result matters");
    assert.isBelow(
      formatted.indexOf("p0002"),
      formatted.indexOf("p0003"),
      "paragraphs should stay in paper order",
    );
  });
});
