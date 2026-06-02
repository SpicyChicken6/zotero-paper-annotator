import { assert } from "chai";
import {
  isAlreadyAnnotated,
  ZPA_PARAGRAPH_TAG,
  ZPA_TAG,
} from "../src/modules/skipCheck.ts";

function itemWithTagsAndAnnotations(
  tags: Array<{ tag: string }>,
  annotationCount?: number,
): Zotero.Item {
  return {
    getTags: () => tags,
    getAnnotations:
      annotationCount === undefined
        ? undefined
        : () => Array.from({ length: annotationCount }),
  } as unknown as Zotero.Item;
}

describe("isAlreadyAnnotated", function () {
  it("does not skip tagged PDF attachments with no saved annotations", function () {
    const item = itemWithTagsAndAnnotations([{ tag: ZPA_TAG }], 0);

    assert.isFalse(isAlreadyAnnotated(item));
  });

  it("skips tagged PDF attachments with saved annotations", function () {
    const item = itemWithTagsAndAnnotations([{ tag: ZPA_TAG }], 2);

    assert.isTrue(isAlreadyAnnotated(item));
  });

  it("keeps tag-only behavior for items without annotation children", function () {
    const item = itemWithTagsAndAnnotations([{ tag: ZPA_TAG }]);

    assert.isTrue(isAlreadyAnnotated(item));
  });

  it("does not let the old selective tag satisfy paragraph-summary completion", function () {
    const item = itemWithTagsAndAnnotations([{ tag: ZPA_TAG }], 2);

    assert.isFalse(isAlreadyAnnotated(item, ZPA_PARAGRAPH_TAG));
  });
});
