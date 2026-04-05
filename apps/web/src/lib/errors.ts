const ERROR_MESSAGE_KEYS = ["message", "error_description", "error", "details", "hint", "code"] as const;

export function toErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;

    for (const key of ERROR_MESSAGE_KEYS) {
      const value = record[key];

      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
  }

  return fallback;
}
