import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));
const cloudDeviceMocks = vi.hoisted(() => ({
  deleteCloudDevice: vi.fn(),
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
    cloudDeviceMocks.deleteCloudDevice.mockResolvedValue("cloud-device-history");
    cloudDeviceMocks.setDefaultDevice.mockResolvedValue("cloud-device-1");
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

        if (url === "/api/bridge/route-status") {
          return new Response(
            JSON.stringify({
              kind: "local",
              reason: "local_device_matches_default",
              defaultLocalDeviceId: "local-device-1",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        if (url.startsWith("/api/realtime/device/status")) {
          return new Response(
            JSON.stringify({
              connected: true,
              deviceId: "cloud-device-1",
              hostname: "relay.local",
              name: "Relay Mac",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
  });

  it("shows only account/device and appearance tabs, with advanced fields hidden by default", async () => {
    render(<SettingsPageClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "账号与设备", selected: true })).toBeTruthy();
    });

    expect(screen.getByRole("tab", { name: "外观" })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "总览" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "设备" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "访问" })).toBeNull();
    expect(screen.getAllByText("登录状态").length).toBeGreaterThan(0);
    expect(screen.getAllByText("当前连接电脑").length).toBeGreaterThan(0);
    expect(screen.getAllByText("默认设备").length).toBeGreaterThan(0);
    expect(screen.queryByText("用户 ID")).toBeNull();
    expect(screen.queryByText("设备 ID")).toBeNull();

    await user.click(screen.getByRole("button", { name: "展开高级信息" }));
    expect(screen.getByText("用户 ID")).toBeTruthy();
    expect(screen.getByText("设备 ID")).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "外观" }));
    expect(screen.getByRole("tab", { name: "外观", selected: true })).toBeTruthy();
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

        if (url === "/api/bridge/route-status") {
          return new Response(
            JSON.stringify({
              kind: "unavailable",
              reason: "default_device_offline",
              defaultLocalDeviceId: "local-device-1",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        if (url.startsWith("/api/realtime/device/status")) {
          return new Response(
            JSON.stringify({
              connected: false,
              deviceId: "local-device-1",
              hostname: "relay.local",
              name: "Relay Mac",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<SettingsPageClient language="zh" />);

    await waitFor(() => {
      expect(screen.getAllByText("GitHub").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText("user-1")).toBeNull();
    expect(screen.getAllByText("云端 Web 会话").length).toBeGreaterThan(0);
    expect(screen.getAllByText("本机状态不可直读").length).toBeGreaterThan(0);
    expect(screen.getAllByText("当前运行在公网 Web 环境，账号态和云端设备目录可用，但无法直接读取这台服务器上的本机 Relay。").length).toBeGreaterThan(0);
    expect(screen.getByText("其他设备")).toBeTruthy();
  });

  it("shows local takeover, groups historical devices, and only reveals cleanup inside the history section", async () => {
    cloudDeviceMocks.loadDeviceDirectory.mockResolvedValue({
      userId: "user-1",
      defaultDeviceId: "cloud-device-offline",
      items: [
        {
          id: "cloud-device-offline",
          userId: "user-1",
          localDeviceId: "local-device-old",
          name: "Relay Mac",
          hostname: "relay.local",
          platform: "darwin",
          arch: "arm64",
          status: "offline",
          lastSeenAt: "2026-04-05T00:00:00.000Z",
          createdAt: "2026-04-05T00:00:00.000Z",
          updatedAt: "2026-04-05T00:00:00.000Z",
        },
        {
          id: "cloud-device-history",
          userId: "user-1",
          localDeviceId: "local-device-older",
          name: "Relay Mac",
          hostname: "relay.local",
          platform: "darwin",
          arch: "arm64",
          status: "offline",
          lastSeenAt: "2026-04-04T00:00:00.000Z",
          createdAt: "2026-04-04T00:00:00.000Z",
          updatedAt: "2026-04-04T00:00:00.000Z",
        },
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

        if (url === "/api/bridge/route-status") {
          return new Response(
            JSON.stringify({
              kind: "local",
              reason: "default_device_offline_using_local",
              defaultLocalDeviceId: "local-device-old",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        if (url.startsWith("/api/realtime/device/status")) {
          return new Response(
            JSON.stringify({
              connected: false,
              deviceId: "cloud-device-offline",
              hostname: "relay.local",
              name: "Relay Mac",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<SettingsPageClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "账号与设备", selected: true })).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getAllByText("当前设备已自动接管").length).toBeGreaterThan(0);
      expect(
        screen.getAllByText("默认设备当前不可用，但你现在就在一台已绑定且在线的本机 Relay 上，所以系统已自动回退到当前设备，保证你可以继续使用。").length,
      ).toBeGreaterThan(0);
      expect(screen.getByText("当前设备已接管")).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: "清理历史记录" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "展开历史记录" }));

    expect(screen.getByText("历史离线设备")).toBeTruthy();
    expect(screen.getByRole("button", { name: "清理历史记录" })).toBeTruthy();
    expect(screen.getByText("这是一条旧设备记录，只用于清理，不会再作为主连接目标。")).toBeTruthy();
  });

  it("cleans a historical device from the history section", async () => {
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
        {
          id: "cloud-device-history",
          userId: "user-1",
          localDeviceId: "local-device-old",
          name: "Relay Mac",
          hostname: "relay.local",
          platform: "darwin",
          arch: "arm64",
          status: "offline",
          lastSeenAt: "2026-04-04T00:00:00.000Z",
          createdAt: "2026-04-04T00:00:00.000Z",
          updatedAt: "2026-04-04T00:00:00.000Z",
        },
      ],
    });

    render(<SettingsPageClient language="zh" />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "展开历史记录" })).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "展开历史记录" }));
    await user.click(screen.getByRole("button", { name: "清理历史记录" }));

    await waitFor(() => {
      expect(cloudDeviceMocks.deleteCloudDevice).toHaveBeenCalledWith("cloud-device-history");
    });

    expect(screen.getAllByText("历史设备已清理").length).toBeGreaterThan(0);
  });
});
