import { proxyBridge } from "../_lib";

export async function GET() {
  return proxyBridge("/device");
}
