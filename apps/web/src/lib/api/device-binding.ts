"use client";

import { toErrorMessage } from "@/lib/errors";

type DeviceBindCode = {
  code: string;
  expiresAt: string;
};

async function createDeviceBindCode(localDeviceId: string, deviceName: string): Promise<DeviceBindCode> {
  const response = await fetch("/api/cloud/device-bind-code", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      deviceName,
      localDeviceId,
    }),
  });
  const payload = (await response.json().catch(() => null)) as { code?: string; expiresAt?: string; error?: string } | null;

  if (!response.ok) {
    throw new Error(toErrorMessage(payload, "Failed to create a device bind code."));
  }

  if (!payload?.code || !payload.expiresAt) {
    throw new Error("Supabase did not return a bind code.");
  }

  return {
    code: payload.code,
    expiresAt: payload.expiresAt,
  };
}

export { createDeviceBindCode };
