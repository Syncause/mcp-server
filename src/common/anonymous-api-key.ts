/**
 * Anonymous API Key Management
 * 
 * Used to asynchronously fetch or generate an anonymous API Key during MCP startup.
 */

import crypto from 'crypto';
import axios from 'axios';
import machineId from 'node-machine-id';
import { logger } from './logger.js';

const { machineIdSync } = machineId;

// Salt: used to hash device ID to prevent direct exposure of hardware information
const DEVICE_ID_SALT = 'syncause-salt-';

// API Base URL
const DEFAULT_API_BASE_URL = 'https://syn-cause.com';

/**
 * Anonymous API Key response interface
 */
interface AnonymousApiKeyResponse {
    success: boolean;
    data?: {
        key: string;
        keyId: string;
        keyName: string;
        isGuest: boolean;
        userId: string;
        createdAt: string;
    };
    error?: string;
}

/**
 * Get system-level unique device identifier (salted and hashed)
 * 
 * Uses node-machine-id to get a stable cross-platform device identifier,
 * then uses SHA-256 with salt to prevent direct exposure of hardware ID.
 */
export function getSystemDeviceId(): string {
    try {
        // 1. Get raw device ID using node-machine-id
        const rawDeviceId = machineIdSync();
        
        if (!rawDeviceId || rawDeviceId.trim().length === 0) {
            throw new Error('Raw device ID is empty');
        }
        
        logger.info('Device ID obtained (hashed for privacy)');

        // 2. Use SHA-256 with salt to prevent exposure of raw hardware ID
        return crypto.createHash('sha256')
            .update(DEVICE_ID_SALT + rawDeviceId)
            .digest('hex');
    } catch (error) {
        logger.error({ err: error }, 'Failed to get system device ID');
        throw new Error(`Failed to get device ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Request an anonymous API Key
 */
async function requestAnonymousApiKey(
    deviceId: string,
    apiBaseUrl: string = DEFAULT_API_BASE_URL
): Promise<AnonymousApiKeyResponse> {
    const url = `${apiBaseUrl}/api/api-keys/anonymous`;
    
    try {
        logger.info(`Requesting anonymous API key from: ${url}`);
        
        const response = await axios.post(url, 
            { deviceId },
            {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 10000,
                validateStatus: () => true // Don't throw on any status
            }
        );
        
        if (response.status >= 200 && response.status < 300) {
            return response.data;
        } else {
            return {
                success: false,
                error: response.data?.error || `HTTP ${response.status}: ${response.statusText}`
            };
        }
    } catch (error: any) {
        logger.error({ err: error }, 'Failed to request anonymous API key');
        return {
            success: false,
            error: error.message || 'Network error'
        };
    }
}

/**
 * Initialize API Key (Main entry point)
 * 
 * This function should be called asynchronously during MCP startup.
 * 
 * @param apiBaseUrl API base URL (optional)
 * @returns API Key string
 */
export async function initializeAnonymousApiKey(
    apiBaseUrl?: string
): Promise<string> {
    // 1. Get Device ID
    let deviceId: string;
    try {
        deviceId = getSystemDeviceId();
        logger.info(`Device ID: ${deviceId}`);
    } catch (error) {
        logger.error({ err: error }, 'Failed to get device ID');
        throw new Error('Cannot initialize without device ID');
    }
    
    // 2. Request anonymous API Key
    const result = await requestAnonymousApiKey(deviceId, apiBaseUrl);
    
    if (!result.success || !result.data) {
        throw new Error(`Failed to get anonymous API key: ${result.error}`);
    }

    logger.info(`Found anonymous API key: ${result.data.key}`);    
    return result.data.key;
}
