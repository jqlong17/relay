import { describe, expect, it } from "vitest";
import { buildLoginRedirect, isProtectedPath } from "../../src/lib/auth/guard";

describe("auth guard path rules", () => {
  it("marks protected app pages and api routes", () => {
    expect(isProtectedPath("/workspace")).toBe(true);
    expect(isProtectedPath("/mobile")).toBe(true);
    expect(isProtectedPath("/api/bridge/sessions")).toBe(true);
    expect(isProtectedPath("/api/codex-automations")).toBe(true);
    expect(isProtectedPath("/api/ui-config")).toBe(true);
  });

  it("keeps public pages outside the protected set", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/about")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
  });

  it("builds login redirects that preserve the requested path", () => {
    expect(buildLoginRedirect("/workspace", "?view=mobile")).toBe("/login?next=%2Fworkspace%3Fview%3Dmobile");
  });
});
