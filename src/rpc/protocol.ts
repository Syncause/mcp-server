export interface RpcRequest<T = any> {
    jsonrpc: "2.0";
    id: string | number;
    method: string;
    params?: T;
}
  
export interface RpcResponse<T = any> {
    jsonrpc: "2.0";
    id: string | number;
    result?: T;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
}

/**
 * Standard JSON-RPC 2.0 Error Codes
 * @see https://www.jsonrpc.org/specification#error_object
 */
export enum RpcErrorCode {
    // Standard codes
    PARSE_ERROR = -32700,
    INVALID_REQUEST = -32600,
    METHOD_NOT_FOUND = -32601,
    INVALID_PARAMS = -32602,
    INTERNAL_ERROR = -32603,
    
    // Custom server error range (-32000 to -32099)
    UNAUTHORIZED = -32001,
    TRANSPORT_ERROR = -32099
}