type BrokenThreadReason = "rollout_missing" | "thread_resume_failed" | "thread_read_failed";

function classifyBrokenThreadError(error: unknown): BrokenThreadReason | null {
  if (!(error instanceof Error)) {
    return null;
  }

  if (isThreadNotFoundError(error)) {
    return null;
  }

  const message = error.message.toLowerCase();

  if (
    message.includes("no rollout found for thread id") ||
    (message.includes("rollout") && (message.includes("missing") || message.includes("not found")))
  ) {
    return "rollout_missing";
  }

  if (
    message.includes("failed to resume thread") ||
    (message.includes("thread/resume") && message.includes("failed")) ||
    (message.includes("resume") && message.includes("failed"))
  ) {
    return "thread_resume_failed";
  }

  if (message.trim().length > 0) {
    return "thread_read_failed";
  }

  return null;
}

function isThreadNotFoundError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  if (message === "not found") {
    return true;
  }

  return message.includes("thread not found") || (message.includes("thread") && message.includes("not found"));
}

export { classifyBrokenThreadError, isThreadNotFoundError };
export type { BrokenThreadReason };
