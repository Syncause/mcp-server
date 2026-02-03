import type { RpcRequest, RpcResponse } from "../rpc/protocol.js";

export interface Transport {
  connect(): Promise<void>;
  request(req: RpcRequest): Promise<RpcResponse>;
  close(): Promise<void>;
}
