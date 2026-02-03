import http from "http";
import https from "https";
import axios from "axios";
import type { AxiosInstance } from "axios";
import type { Transport } from "../base.js";
import { RpcErrorCode } from "../../rpc/protocol.js";
import type { RpcRequest, RpcResponse } from "../../rpc/protocol.js";
import { logger } from "../../common/logger.js";

export class AxiosTransport implements Transport {
  private axiosInstance: AxiosInstance;
  private isClosing = false;
  private httpAgent: http.Agent;
  private httpsAgent: https.Agent;

  constructor(
    private mode: "local" | "remote",
    private connectionPath: string,
    private apiKey: string,
  ) {
    this.httpAgent = new http.Agent({ keepAlive: true });
    this.httpsAgent = new https.Agent({ keepAlive: true });

    const config = {
      timeout: 10000,
      validateStatus: () => true,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json'
      },
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent
    };

    if (this.mode === "local") {
      this.axiosInstance = axios.create({
        ...config,
        socketPath: this.connectionPath,
        baseURL: "http://localhost",
      });
    } else {
      this.axiosInstance = axios.create({
        ...config,
        baseURL: this.connectionPath,
      });
    }
  }

  async connect() {
    this.isClosing = false;
    let lastError: any;
    
    // Retry up to 3 times with 500ms delay to handle daemon startup lag
    for (let i = 0; i < 3; i++) {
      try {
        logger.info({ attempt: i + 1 }, "Sending Ping request");
        // Use a shorter timeout for the initial connection ping
        await this.axiosInstance.post("/", {
          jsonrpc: "2.0",
          id: "ping-" + Date.now(),
          method: "ping"
        }, { timeout: 2000 });
        return;
      } catch (err: any) {
        lastError = err;
        if (i < 2 && !this.isClosing) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    throw lastError;
  }

  async request(req: RpcRequest): Promise<RpcResponse> {
    if (this.isClosing) {
      return {
        jsonrpc: "2.0",
        id: req.id,
        error: {
          code: RpcErrorCode.INTERNAL_ERROR,
          message: "Transport is closing"
        }
      };
    }
    logger.trace({ req }, "Sending RPC request");
    try {
      const response = await this.axiosInstance.post("/", req);
      
      if (response.data && typeof response.data === "object" && response.data.jsonrpc === "2.0") {
        return response.data as RpcResponse;
      }

      const errorMessage = typeof response.data === "string" 
        ? response.data 
        : (response.statusText || "Unknown Server Error");

      const errorContext = {
        method: req.method,
        url: this.mode === 'local' ? this.connectionPath : this.axiosInstance.defaults.baseURL,
        status: response.status,
        params: req.params
      };

      logger.error({ ...errorContext, response: response.data }, "Server returned non-RPC response");

      return {
        jsonrpc: "2.0",
        id: req.id,
        error: {
          code: response.status >= 500 ? RpcErrorCode.INTERNAL_ERROR : RpcErrorCode.INVALID_REQUEST,
          message: `Server returned non-RPC response (${response.status}): ${errorMessage.substring(0, 200)}`,
          data: response.data
        }
      };
    } catch (error: any) {
      const isConnError = [
        "ECONNREFUSED", 
        "ENOENT", 
        "ECONNRESET", 
        "ETIMEDOUT", 
        "ENOTFOUND",
        "EPIPE"
      ].includes(error.code);

      const errorContext = {
        code: error.code,
        method: req.method,
        url: this.mode === 'local' ? this.connectionPath : this.axiosInstance.defaults.baseURL,
        params: req.params
      };

      if (isConnError && !this.isClosing) {
        logger.warn({ 
          ...errorContext,
          message: error.message
        }, "Connection error detected.");
      } else {
        logger.error({ ...errorContext, message: error.message }, "Transport request failed");
      }

      return {
        jsonrpc: "2.0",
        id: req.id,
        error: {
          code: RpcErrorCode.TRANSPORT_ERROR,
          message: `Transport Error: ${error.message}`,
          data: { code: error.code }
        }
      };
    }
  }

  async close() {
    this.isClosing = true;
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
  }
}
