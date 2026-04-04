import type { TimelineMemory } from "@relay/shared-types";

import type { MemoryStore } from "../store/memory-store";

type SearchMemoriesOptions = {
  query?: string;
  sessionId?: string;
  themeKey?: string;
  date?: string;
  limit?: number;
};

type MemoryInjectionContext = {
  contextTitle: string;
  contextBody: string;
  sourceMemoryIds: string[];
  truncationApplied: boolean;
};

function searchMemories(memoryStore: MemoryStore, options: SearchMemoriesOptions = {}) {
  const limit = options.limit ?? 8;
  const query = options.query?.trim().toLowerCase();

  const filtered = memoryStore
    .listAll()
    .filter((memory) => {
      if (options.sessionId && memory.sessionId !== options.sessionId) {
        return false;
      }

      if (options.themeKey && memory.themeKey !== options.themeKey) {
        return false;
      }

      if (options.date && memory.memoryDate !== options.date) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [
        memory.title,
        memory.content,
        memory.themeTitle,
        memory.themeKey,
        memory.sessionTitleSnapshot,
        memory.memoryDate,
      ]
        .join("\n")
        .toLowerCase();

      return haystack.includes(query);
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return filtered.slice(0, limit);
}

function buildMemoryInjectionContext(
  memories: TimelineMemory[],
  options: {
    maxItems?: number;
    maxChars?: number;
  } = {},
): MemoryInjectionContext {
  const maxItems = options.maxItems ?? 5;
  const maxChars = options.maxChars ?? 4000;
  const selected = memories.slice(0, maxItems);
  const sourceMemoryIds = selected.map((memory) => memory.id);

  const blocks: string[] = [];
  let currentChars = 0;
  let truncationApplied = false;

  for (const memory of selected) {
    const block = [
      `## ${memory.title}`,
      `theme: ${memory.themeTitle}`,
      `date: ${memory.memoryDate}`,
      "",
      memory.content.trim(),
    ].join("\n");

    if (currentChars > 0 && currentChars + block.length + 2 > maxChars) {
      truncationApplied = true;
      break;
    }

    blocks.push(block);
    currentChars += block.length + 2;
  }

  return {
    contextTitle: "Relay Memories",
    contextBody: blocks.join("\n\n"),
    sourceMemoryIds,
    truncationApplied,
  };
}

export { buildMemoryInjectionContext, searchMemories };
export type { MemoryInjectionContext, SearchMemoriesOptions };
