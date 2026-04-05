import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));
const cloudDeviceMocks = vi.hoisted(() => ({
  loadDeviceDirectory: vi.fn(),
  setDefaultDevice: vi.fn(),
}));
const deviceBootstrapMocks = vi.hoisted(() => ({
  ensureCurrentGitHubDeviceReady: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks,
}));
vi.mock("@/lib/api/cloud-devices", () => cloudDeviceMocks);
vi.mock("@/lib/auth/device-bootstrap", () => deviceBootstrapMocks);

import { SettingsPageClient } from "@/components/settings-page-client";

describe("SettingsPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cloudDeviceMocks.loadDeviceDirectory.mockResolvedValue({
      userId: "user-1",
      defaultDeviceId: "cloud-device-1",
      items: [
        {
          id: "cloud-device-1",
          userId: "user-1",
          localDeviceId: "local-device-1",
          name: "Relay Mac",
          hostname: "relay.local",
          platform: "darwin",
          arch: "arm64",
          status: "online",
          lastSeenAt: "2026-04-05T00:00:00.000Z",
          createdAt: "2026-04-05T00:00:00.000Z",
          updatedAt: "2026-04-05T00:00:00.000Z",
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        if (url === "/api/ui-config") {
          return new Response(
            JSON.stringify({
              content: "theme = \"light\"",
              uiConfig: {
                language: "zh",
                theme: "light",
              },
              cssVariables: {},
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        if (url === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              authenticated: true,
              configured: true,
              session: {
                method: "github",
                provider: "github",
                userId: "user-1",
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        if (url === "/api/bridge/device") {
          return new Response(
            JSON.stringify({
              item: {
                id: "local-device-1",
                name: "Relay Mac",
                hostname: "relay.local",
                platform: "darwin",
                arch: "arm64",
                status: "online",
                bindingStatus: "bound",
                boundUserId: "user-1",
                createdAt: "2026-04-05T00:00:00.000Z",
                updatedAt: "2026-04-05T00:00:00.000Z",
                lastSeenAt: "2026-04-05T00:00:00.000Z",
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
  });

  it("shows overview by default and switches sections with top tabs", async () => {
    render(<SettingsPageClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "总览", selected: true })).toBeTruthy();
    });

    expect(screen.getByText("账号与设备")).toBeTruthy();
    expect(screen.queryByText("远程访问")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "设备" }));
    expect(screen.getByRole("tab", { name: "设备", selected: true })).toBeTruthy();
    expect(screen.getByText("我的设备")).toBeTruthy();
    expect(screen.queryByText("远程访问")).toBeNull();

    await user.click(screen.getByRole("tab", { name: "访问" }));
    expect(screen.getByRole("tab", { name: "访问", selected: true })).toBeTruthy();
    expect(screen.getByText("远程访问")).toBeTruthy();
    expect(screen.queryByText("账号与设备")).toBeNull();
  });

  it("keeps the GitHub account state when the local bridge device is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        if (url === "/api/ui-config") {
          return new Response(
            JSON.stringify({
              content: "theme = \"light\"",
              uiConfig: {
                language: "zh",
                theme: "light",
              },
              cssVariables: {},
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        if (url === "/api/auth/session") {
          return new Response(
            JSON.stringify({
              authenticated: true,
              configured: true,
              session: {
                method: "github",
                provider: "github",
                userId: "user-1",
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        if (url === "/api/bridge/device") {
          return new Response(JSON.stringify({ error: "offline" }), {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<SettingsPageClient language="zh" />);

    await waitFor(() => {
      expect(screen.getAllByText("GitHub")).toHaveLength(2);
    });

    expect(screen.getAllByText("user-1")).toHaveLength(2);
    expect(screen.getAllByText("云端 Web 会话")).toHaveLength(2);
    expect(screen.getAllByText("本机状态不可直读").length).toBeGreaterThan(0);
    expect(screen.getByText("当前运行在公网 Web 环境，账号态和云端设备目录可用，但无法直接读取这台服务器上的本机 Relay。")).toBeTruthy();
    expect(screen.getAllByText("Relay Mac")).toHaveLength(2);
  });
});
