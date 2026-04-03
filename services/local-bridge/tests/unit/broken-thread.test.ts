import { describe, expect, it } from "vitest";

import { classifyBrokenThreadError, isThreadNotFoundError } from "../../src/services/broken-thread";

describe("broken thread helpers", () => {
  it("classifies missing rollout errors", () => {
    const error = new Error("Failed to resume thread: no rollout found for thread id abc");
    expect(classifyBrokenThreadError(error)).toBe("rollout_missing");
  });

  it("classifies resume failures", () => {
    const error = new Error("thread/resume failed: backend unavailable");
    expect(classifyBrokenThreadError(error)).toBe("thread_resume_failed");
  });

  it("detects not found errors and excludes them from broken classification", () => {
    const error = new Error("thread not found");
    expect(isThreadNotFoundError(error)).toBe(true);
    expect(classifyBrokenThreadError(error)).toBeNull();
  });
});
