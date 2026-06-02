import { assert } from "chai";
import { resolvePipelineItemScope } from "../src/modules/pipeline.ts";

function itemWithParent(id: number, parentItem?: Zotero.Item): Zotero.Item {
  return { id, parentItem } as Zotero.Item;
}

describe("pipeline item scoping", function () {
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
});
