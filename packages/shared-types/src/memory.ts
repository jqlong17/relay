type TimelineMemoryStatus = "completed" | "failed";

type TimelineMemory = {
  id: string;
  sessionId: string;
  workspaceId: string;
  themeTitle: string;
  themeKey: string;
  sessionTitleSnapshot: string;
  memoryDate: string;
  checkpointTurnCount: number;
  promptVersion: string;
  title: string;
  content: string;
  status: TimelineMemoryStatus;
  sourceThreadUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  generationError?: string | null;
};

type CreateTimelineMemoryInput = {
  sessionId: string;
  workspaceId: string;
  themeTitle: string;
  themeKey: string;
  sessionTitleSnapshot: string;
  memoryDate: string;
  checkpointTurnCount: number;
  promptVersion: string;
  title: string;
  content: string;
  status: TimelineMemoryStatus;
  sourceThreadUpdatedAt?: string | null;
  generationError?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type { CreateTimelineMemoryInput, TimelineMemory, TimelineMemoryStatus };
