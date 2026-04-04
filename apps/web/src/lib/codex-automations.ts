export type CodexAutomationStatus = "ACTIVE" | "PAUSED";

export type CodexAutomation = {
  id: string;
  name: string;
  prompt: string;
  status: CodexAutomationStatus;
  rrule: string;
  cwds: string[];
  createdAt: number;
  updatedAt: number;
  lastRunAt: number | null;
  nextRunAt: number | null;
  model: string | null;
  reasoningEffort: string | null;
};

export type CodexAutomationRun = {
  automationId: string;
  threadId: string;
  status: "completed" | "failed";
  title: string | null;
  summary: string | null;
  output: string | null;
  prompt: string | null;
  sourceCwd: string | null;
  createdAt: number;
  updatedAt: number;
};

export type CodexAutomationInput = {
  name: string;
  prompt: string;
  status: CodexAutomationStatus;
  rrule: string;
  cwds: string[];
  model?: string | null;
  reasoningEffort?: string | null;
};
