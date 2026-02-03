import axios from "axios";
import { logger } from "../common/logger.js";

export interface AuthConfig {
  apiKey: string;
  serviceProxyUrl?: string;
}

/**
 * Validate API_KEY permissions
 */
export async function validateApiKey(config: AuthConfig) {
  let baseUrl = config.serviceProxyUrl || "https://api.syn-cause.com/codeproxy";
  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }
  const url = `${baseUrl}/api/v1/apps?api_key=${config.apiKey}`;

  try {
    const response = await axios.get(url);
    if (response.data && response.data.success === true) {
      return;
    }
    logger.error({ data: response.data }, "API_KEY validation failed");
    throw new Error(`Invalid or expired API key: ${JSON.stringify(response.data)}`);
  } catch (err: any) {
    if (err.response) {
      logger.error({
        status: err.response.status,
        data: err.response.data
      }, "API_KEY validation failed with response");
      throw new Error(`Invalid or expired API key: ${JSON.stringify(err.response.data)}`);
    } else {
      logger.error({ err: err.message }, "API_KEY validation failed with error");
      throw new Error(`Invalid or expired API key: ${err.message}`);
    }
  }
}
