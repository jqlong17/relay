import type { Message } from "./message";

type Session = {
  id: string;
  workspaceId: string;
  title: string;
  turnCount: number;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
};

export type { Session };
