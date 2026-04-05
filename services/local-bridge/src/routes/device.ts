import type { IncomingMessage, ServerResponse } from "node:http";

import { readJsonBody } from "./json-body";
import { DeviceBindingService } from "../services/device-binding-service";
import { LocalDeviceService } from "../services/local-device-service";

async function handleDeviceRoute(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
  localDeviceService: LocalDeviceService,
  deviceBindingService: DeviceBindingService,
) {
  if (request.method === "GET" && request.url === "/device") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ item: localDeviceService.getDevice() }));
    return true;
  }

  if (request.method === "POST" && request.url === "/device/bind") {
    const body = await readJsonBody<{ code?: string }>(request);
    const code = body.code?.trim() ?? "";

    if (code.length === 0) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Bind code is required." }));
      return true;
    }

    try {
      const device = localDeviceService.getDevice();
      const boundDevice = await deviceBindingService.bindDevice(code, device);
      localDeviceService.saveDevice(boundDevice);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ item: boundDevice }));
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Device binding failed.",
        }),
      );
    }
    return true;
  }

  return false;
}

export { handleDeviceRoute };
