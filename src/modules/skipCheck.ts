const ZPA_TAG = "zpa-annotated";

/**
 * Check if a Zotero item has already been annotated by ZPA.
 */
export function isAlreadyAnnotated(item: Zotero.Item): boolean {
  const tags = item.getTags();
  const hasZpaTag = tags.some((t: { tag: string }) => t.tag === ZPA_TAG);
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
export async function markAsAnnotated(item: Zotero.Item): Promise<void> {
  item.addTag(ZPA_TAG, 0);
  await item.saveTx();
}

export { ZPA_TAG };
