type DeviceBindingStatus = "unbound" | "bound";
type DeviceConnectionStatus = "online" | "offline";

type RelayDevice = {
  id: string;
  name: string;
  hostname: string;
  platform: string;
  arch: string;
  status: DeviceConnectionStatus;
  bindingStatus: DeviceBindingStatus;
  boundUserId: string | null;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
};

type RelayCloudDevice = {
  id: string;
  userId: string;
  localDeviceId: string;
  name: string;
  hostname: string;
  platform: string;
  arch: string;
  status: DeviceConnectionStatus;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type RelayDeviceDirectory = {
  userId: string;
  defaultDeviceId: string | null;
  items: RelayCloudDevice[];
};

export type {
  DeviceBindingStatus,
  DeviceConnectionStatus,
  RelayCloudDevice,
  RelayDevice,
  RelayDeviceDirectory,
};
