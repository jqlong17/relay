"use client";

import type { RelayCloudDevice, RelayDevice, RelayDeviceDirectory } from "@relay/shared-types";
import { bindLocalDevice, getLocalDevice } from "@/lib/api/bridge";
import { loadDeviceDirectory, setDefaultDevice } from "@/lib/api/cloud-devices";
import { createDeviceBindCode } from "@/lib/api/device-binding";

type DeviceBootstrapResult = {
  didBind: boolean;
  didSetDefault: boolean;
  directory: RelayDeviceDirectory;
  localDevice: RelayDevice;
};

function findCloudDevice(items: RelayCloudDevice[], localDeviceId: string) {
  return items.find((item) => item.localDeviceId === localDeviceId) ?? null;
}

async function ensureCurrentGitHubDeviceReady(): Promise<DeviceBootstrapResult> {
  const [localDeviceResponse, deviceDirectory] = await Promise.all([getLocalDevice(), loadDeviceDirectory()]);
  let localDevice = localDeviceResponse.item;
  let directory = deviceDirectory;
  let currentCloudDevice = findCloudDevice(directory.items, localDevice.id);
  let didBind = false;

  if (localDevice.bindingStatus === "bound" && localDevice.boundUserId && localDevice.boundUserId !== directory.userId) {
    throw new Error("This Relay device is already bound to another GitHub account.");
  }

  if (!currentCloudDevice) {
    if (localDevice.bindingStatus === "bound" && localDevice.boundUserId === directory.userId) {
      directory = await loadDeviceDirectory();
      currentCloudDevice = findCloudDevice(directory.items, localDevice.id);
    } else {
      const bindCode = await createDeviceBindCode(localDevice.id, localDevice.name);
      const boundDeviceResponse = await bindLocalDevice(bindCode.code);
      localDevice = boundDeviceResponse.item;
      directory = await loadDeviceDirectory();
      currentCloudDevice = findCloudDevice(directory.items, localDevice.id);
      didBind = true;
    }
  }

  if (!currentCloudDevice) {
    throw new Error("The current Relay device is not visible in your cloud device list yet.");
  }

  let didSetDefault = false;

  if (!directory.defaultDeviceId) {
    const defaultDeviceId = await setDefaultDevice(currentCloudDevice.id);
    directory = {
      ...directory,
      defaultDeviceId,
    };
    didSetDefault = true;
  }

  return {
    didBind,
    didSetDefault,
    directory,
    localDevice,
  };
}

export { ensureCurrentGitHubDeviceReady };
