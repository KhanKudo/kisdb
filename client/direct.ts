import { toKcpProxy, type KCPHandle, type ProxyType } from "../kcp";

export function createDirectClient(handle: KCPHandle): ProxyType {
  return toKcpProxy(handle)
}