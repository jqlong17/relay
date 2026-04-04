import type { Session } from "@relay/shared-types";

import { buildTimelineMemoryPrompt, TIMELINE_MEMORY_PROMPT_VERSION } from "./timeline-memory-prompt";

type MemoryPromptKind = "timeline";

type MemoryPromptDefinition = {
  kind: MemoryPromptKind;
  version: string;
  buildPrompt: (session: Session, checkpointTurnCount: number) => string;
};

const promptDefinitions: Record<MemoryPromptKind, MemoryPromptDefinition> = {
  timeline: {
    kind: "timeline",
    version: TIMELINE_MEMORY_PROMPT_VERSION,
    buildPrompt: buildTimelineMemoryPrompt,
  },
};

function getMemoryPromptDefinition(kind: MemoryPromptKind) {
  return promptDefinitions[kind];
}

export { getMemoryPromptDefinition };
export type { MemoryPromptDefinition, MemoryPromptKind };
