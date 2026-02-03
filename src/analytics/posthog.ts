import { PostHog } from 'posthog-node';
import { logger } from '../common/logger.js';

/**
 * PostHog Analytics Client
 * Used to track MCP tool calls and user events
 */
class PostHogClient {
    private client: PostHog | null = null;
    private apiKey: string | null = null;
    private enabled: boolean = false;

    /**
     * Initialize PostHog client
     * @param apiKey PostHog API Key
     * @param host PostHog service URL (optional, defaults to official service)
     */
    init(apiKey: string, host?: string) {
        if (!apiKey) {
            logger.warn('PostHog API Key not provided, analytics disabled');
            this.enabled = false;
            return;
        }

        try {
            this.apiKey = apiKey;
            this.client = new PostHog(apiKey, {
                host: host || 'https://app.posthog.com',
            });
            this.enabled = true;
            logger.info('PostHog client initialized successfully');
        } catch (error: any) {
            logger.error({ err: error.message }, 'Failed to initialize PostHog client');
            this.enabled = false;
        }
    }

    /**
     * Generate unique tool call ID
     */
    private generateToolCallId(): string {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Track MCP tool call start event
     * @param toolName Tool name
     * @param userId User ID
     * @param properties Additional event properties
     * @returns toolCallId Used to track the complete lifecycle
     */
    trackToolCall(toolName: string, userId: string, properties?: Record<string, any>): string {
        const toolCallId = this.generateToolCallId();

        if (!this.enabled || !this.client) {
            return toolCallId;
        }

        try {
            const eventName = `tool_call_start_${toolName}`;
            this.client.capture({
                distinctId: userId,
                event: eventName,
                properties: {
                    toolCallId,
                    ingestSource: "mcp",
                    ...properties,
                },
            });
            logger.debug({ toolName, userId, toolCallId }, `PostHog event tracked: ${eventName}`);
        } catch (error: any) {
            logger.error({ err: error.message, toolName }, 'Failed to track tool call start');
        }

        return toolCallId;
    }

    /**
     * Track MCP tool call success event
     */
    trackToolSuccess(toolName: string, userId: string, toolCallId: string, executionTime?: number, properties?: Record<string, any>) {
        if (!this.enabled || !this.client) {
            return;
        }

        try {
            const eventName = `tool_call_success_${toolName}`;
            this.client.capture({
                distinctId: userId,
                event: eventName,
                properties: {
                    toolCallId,
                    executionTimeMs: executionTime,
                    ingestSource: "mcp",
                    ...properties,
                },
            });
            logger.debug({ toolName, userId, toolCallId, executionTime }, `PostHog event tracked: ${eventName}`);
        } catch (error: any) {
            logger.error({ err: error.message, toolName }, 'Failed to track tool success');
        }
    }

    /**
     * Track MCP tool call error event
     */
    trackToolError(toolName: string, userId: string, toolCallId: string, error: string, properties?: Record<string, any>) {
        if (!this.enabled || !this.client) {
            return;
        }

        try {
            const eventName = `tool_call_error_${toolName}`;
            this.client.capture({
                distinctId: userId,
                event: eventName,
                properties: {
                    toolCallId,
                    errorMessage: error,
                    ingestSource: "mcp",
                    ...properties,
                },
            });
            logger.debug({ toolName, userId, toolCallId, error }, `PostHog event tracked: ${eventName}`);
        } catch (error: any) {
            logger.error({ err: error.message, toolName }, 'Failed to track tool error');
        }
    }

    /**
     * Track server start event
     */
    trackServerStart(userId: string, properties?: Record<string, any>) {
        if (!this.enabled || !this.client) {
            return;
        }

        try {
            this.client.capture({
                distinctId: userId,
                event: 'mcp_server_start',
                properties: {
                    ingestSource: "mcp",
                    ...properties,
                },
            });
            logger.debug({ userId }, 'PostHog event tracked: mcp_server_start');
        } catch (error: any) {
            logger.error({ err: error.message }, 'Failed to track server start');
        }
    }

    /**
     * Shutdown PostHog client, ensuring all events are sent
     */
    async shutdown() {
        if (!this.client) {
            return;
        }

        try {
            await this.client.shutdown();
            logger.info('PostHog client shut down successfully');
        } catch (error: any) {
            logger.error({ err: error.message }, 'Failed to shut down PostHog client');
        }
    }
}

// PostHog configuration - for internal analytics, no user configuration needed
const POSTHOG_CONFIG = {
    apiKey: 'phc_OgdcBSCdZ2yot246MWYqR3Y0OlaZBpeoHGJxRyqmcQw',
    host: 'https://us.i.posthog.com',
};

// Export singleton and auto-initialize
export const posthog = new PostHogClient();
posthog.init(POSTHOG_CONFIG.apiKey, POSTHOG_CONFIG.host);
