export function getClipboardImageFiles(data: DataTransfer | null | undefined) {
  if (!data) {
    return [];
  }

  const fromItems = Array.from(data.items ?? [])
    .filter((item) => item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);

  if (fromItems.length > 0) {
    return fromItems;
  }

  return Array.from(data.files ?? []).filter((file) => file.type.startsWith("image/"));
}

export async function readClipboardImageFiles() {
  if (typeof navigator === "undefined" || !navigator.clipboard?.read) {
    return [];
  }

  try {
    const items = await navigator.clipboard.read();
    const files = await Promise.all(
      items.flatMap((item, index) =>
        item.types
          .filter((type) => type.startsWith("image/"))
          .map(async (type) => {
            const blob = await item.getType(type);
            const extension = type.split("/")[1] || "png";
            return new File([blob], `clipboard-image-${index + 1}.${extension}`, { type });
          }),
      ),
    );

    return files;
  } catch {
    return [];
  }
}
