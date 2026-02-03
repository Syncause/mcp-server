import type { Transport } from "../transport/base.js";
import type { RpcRequest } from "./protocol.js";
import { v4 as uuidv4 } from "uuid";

export class RpcClient {
  static async call<T = any>(transport: Transport, method: string, params?: any): Promise<T> {
    const req: RpcRequest = {
      jsonrpc: "2.0",
      id: uuidv4(),
      method,
      params,
    };
    const res = await transport.request(req);
    if (res.error) {
        throw new Error(res.error.message);
    }
    return res.result;
  }

  static async ping(transport: Transport): Promise<void> {
    await this.call(transport, "ping");
  }
}
