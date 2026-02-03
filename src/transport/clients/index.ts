import type { Transport } from "../base.js";
import { AxiosTransport } from "./axios-transport.js";

export function createTransport(opts: {
  mode: "local" | "remote";
  apiKey: string;
  endpoint?: string;
}): Transport {
  const addr = opts.endpoint || (opts.mode === "remote" 
    ? "http://localhost:3000"
    : (process.platform === "win32" 
        ? "\\\\?\\pipe\\syncause-debug-daemon" 
        : "/tmp/syncause-debug-daemon.sock"));

  return new AxiosTransport(
    opts.mode,
    addr,
    opts.apiKey,
  );
}
