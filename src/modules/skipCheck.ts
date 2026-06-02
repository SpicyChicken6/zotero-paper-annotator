const ZPA_TAG = "zpa-annotated";
const ZPA_PARAGRAPH_TAG = "zpa-paragraph-summarized";

/**
 * Check if a Zotero item has already been annotated by ZPA.
 */
export function isAlreadyAnnotated(
  item: Zotero.Item,
  tag: string = ZPA_TAG,
): boolean {
  const tags = item.getTags();
  const hasZpaTag = tags.some((t: { tag: string }) => t.tag === tag);
  if (!hasZpaTag) {
    return false;
  }

  if (typeof item.getAnnotations === "function") {
    return item.getAnnotations().length > 0;
  }

  return true;
}

/**
 * Mark a Zotero item as annotated by ZPA.
 */
export async function markAsAnnotated(
  item: Zotero.Item,
  tag: string = ZPA_TAG,
): Promise<void> {
  item.addTag(tag, 0);
  await item.saveTx();
}

export { ZPA_PARAGRAPH_TAG, ZPA_TAG };
