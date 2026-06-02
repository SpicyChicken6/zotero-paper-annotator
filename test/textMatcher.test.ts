import { assert } from "chai";
import { findQuoteInPage } from "../src/modules/textMatcher.ts";

type TextItem = Parameters<typeof findQuoteInPage>[2][number];

function textItem(str: string, x = 0, y = 0): TextItem {
  return {
    str,
    x,
    y,
    width: str.length,
    height: 10,
  };
}

describe("findQuoteInPage", function () {
  it("exact matches long quotes before applying fuzzy limits", function () {
    const quote = [
      "This paragraph describes a deterministic annotation strategy",
      "that keeps Zotero responsive while matching carefully chosen",
      "evidence across a dense scientific page with many repeated terms.",
    ].join(" ");
    const items = [textItem(quote, 2, 6)];

    const result = findQuoteInPage(quote, quote, items);

    assert.deepEqual(result, [[2, 6, 189, 16]]);
  });

  it("fuzzy matches a short quote when anchored words line up", function () {
    const pageText =
      "The method improves robust retrieval under noisy evidence.";
    const items = [textItem(pageText, 12, 34)];

    const result = findQuoteInPage(
      "The method improves robust retreival under noisy evidence.",
      pageText,
      items,
    );

    assert.deepEqual(result, [[12, 34, 70, 44]]);
  });

  it("does not fuzzy match long quotes", function () {
    const quote =
      "This paragraph describes a deterministic annotation strategy that keeps Zotero responsive while matching carefully chosen evidence across a dense scientific page with many repeated terms.";
    const pageText = quote.replace("responsive", "responsivve");
    const items = [textItem(pageText, 5, 8)];

    const result = findQuoteInPage(quote, pageText, items);

    assert.isNull(result);
  });

  it("does not fuzzy match long pages", function () {
    const quote = "deterministic candidate anchors protect the interface";
    const prefix = "background context ".repeat(360);
    const pageText = `${prefix}${quote.replace("candidate", "candiate")}`;
    const items = [textItem(pageText, 3, 4)];

    const result = findQuoteInPage(quote, pageText, items);

    assert.isNull(result);
  });
});
