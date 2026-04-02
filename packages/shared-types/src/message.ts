type MessageRole = "user" | "assistant" | "system" | "tool";
type MessageStatus = "streaming" | "completed" | "error";

type Message = {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  status?: MessageStatus;
  sequence: number;
  createdAt: string;
  updatedAt: string;
};

export type { Message, MessageRole, MessageStatus };
