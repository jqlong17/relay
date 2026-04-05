type MessageRole = "user" | "assistant" | "system" | "tool";
type MessageStatus = "streaming" | "completed" | "error";
type ProcessPhase = "thinking" | "plan" | "command";

type ProcessMessageMeta = {
  phase: ProcessPhase;
  itemId: string;
  label?: string;
};

type Message = {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  status?: MessageStatus;
  meta?: {
    kind?: "process";
    process?: ProcessMessageMeta;
  };
  sequence: number;
  createdAt: string;
  updatedAt: string;
};

export type { Message, MessageRole, MessageStatus, ProcessPhase, ProcessMessageMeta };
