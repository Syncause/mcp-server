import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "../transport/base.js";
import { RpcClient } from "../rpc/client.js";
import { VERSION } from "../common/version.js";
import { logger } from "../common/logger.js";
import { ProjectManager } from "../common/project-manager.js";
import { handleSetupProject } from "./skills.js";
import { state } from "../common/state.js";
import { posthog } from "../analytics/posthog.js";

export async function startMcpServer(transport: Transport, projectManager?: ProjectManager, apiKey?: string) {
  // Create MCP Server instance
  const server = new McpServer(
    {
      name: "syncause-debug-mcp",
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Helper to handle tool calls with logging and proper wrapping
  const handleToolCall = async (name: string, args: any) => {
    // 1. Check API Key Status (from background validation)
    if (state.isApiKeyValid === false) {
      return {
        content: [{
          type: "text" as const,
          text: `CRITICAL ERROR: API Key validation failed.\nReason: ${state.apiKeyError || "Unknown error"}\nPlease check your API_KEY environment variable or certificate file.`
        }],
        isError: true
      };
    }

    // If still validating, AI can proceed but might hit daemon errors anyway
    // We let it pass here but it's good to have the state just in case

    let finalArgs = { ...args };

    // Validate projectId if projectManager is available
    if (projectManager && finalArgs.projectId) {
      if (!projectManager.hasProjectId(finalArgs.projectId)) {
        logger.info({ tool: name, projectId: finalArgs.projectId }, `projectId not in cache, scanning...`);
        await projectManager.scan(true);

        if (!projectManager.hasProjectId(finalArgs.projectId)) {
          logger.warn({ tool: name, projectId: finalArgs.projectId }, `projectId still not found after scan`);
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: projectId '${finalArgs.projectId}' not found. Use 'setup_project' to create a project configuration first.`
              }
            ],
            isError: true
          };
        }
      }
    } else if (projectManager && !finalArgs.projectId && name !== "setup_project" && name !== "get_project_list") {
      // For tools that expect projectId but it's missing
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: projectId is missing. Use 'get_project_list' to find the matching 'projectId' for your project or use 'setup_project' to create a new one.`
          }
        ],
        isError: true
      };
    }

    logger.info({ tool: name, args: finalArgs }, `Calling tool ${name}`);

    // Track tool call start and get toolCallId
    const userId = apiKey || "unknown";
    const toolCallId = posthog.trackToolCall(name, userId, {
      projectId: finalArgs.projectId
    });

    const startTime = Date.now();

    try {
      const result = await RpcClient.call(transport, name, finalArgs);

      // Track success
      const duration = Date.now() - startTime;
      posthog.trackToolSuccess(name, userId, toolCallId, duration, {
        projectId: finalArgs.projectId
      });

      logger.info({ tool: name, result: result ? "received" : "null/undefined" }, `Tool ${name} returned`);

      // If result is already in MCP format, return it
      if (result && typeof result === 'object' && 'content' in result) {
        return result;
      }

      // Otherwise, wrap it in the expected MCP format
      return {
        content: [
          {
            type: "text" as const,
            text: result === null || result === undefined
              ? "(empty result)"
              : (typeof result === 'string' ? result : JSON.stringify(result, null, 2))
          }
        ]
      };
    } catch (error: any) {
      // Track error
      posthog.trackToolError(name, userId, toolCallId, error.message, {
        projectId: finalArgs.projectId
      });

      logger.error({ tool: name, error: error.message }, `Tool ${name} failed`);

      let userMessage = error.message;
      // Handle connection errors with helpful guidance for the AI (Self-healing)
      if (error.message.includes("ECONNREFUSED") || error.message.includes("ENOENT")) {
        userMessage = "Syncause Debug Daemon is not ready or is initializing.\n" +
          "POSSIBLE CAUSE: The background service is being installed/updated via npx or is still starting up.\n" +
          "SUGGESTION: Please wait 10-30 seconds and try again. This may take longer during the first run or after an update.";
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${userMessage}`
          }
        ],
        isError: true
      };
    }
  };

  logger.info("Registering tools...");

  server.registerTool("search_debug_traces", {
    description: "Entry point for troubleshooting. Search for relevant error logs, slow queries, or specific business ID execution traces based on user questions or error descriptions.",
    inputSchema: z.object({
      projectId: z.string().describe("The unique identifier of the project."),
      query: z.string().describe("A natural language description of the issue or context you are investigating. It can include specific error messages, symptoms (e.g., 'high latency'), business IDs (e.g., 'order #123'), or any general question about the request execution flow you want to analyze."),
      limit: z.number().describe("Number of most relevant trace records to return.").default(5)
    }),
  }, async (args) => await handleToolCall("search_debug_traces", args));

  server.registerTool("get_trace_insight", {
    description: "Get a complete lifecycle report for a single request, including call tree skeleton, key SQL summaries, and exception logs.",
    inputSchema: z.object({
      projectId: z.string().describe("The unique identifier of the project."),
      traceId: z.string().describe("Unique identifier obtained from search_debug_traces.")
    }),
  }, async (args) => await handleToolCall("get_trace_insight", args));

  server.registerTool("inspect_method_snapshot", {
    description: "Deep dive into a specific method for a given request, returning precise input/output parameters, local variables, and logs generated within its scope.",
    inputSchema: z.object({
      projectId: z.string().describe("The unique identifier of the project."),
      traceId: z.string().describe("Unique identifier."),
      className: z.string().describe("Full class name of the method."),
      methodName: z.string().describe("Name of the method."),
      includeSubCalls: z.boolean().describe("Whether to include execution summaries and key IO of sub-methods.").default(true)
    }),
  }, async (args) => await handleToolCall("inspect_method_snapshot", args));

  server.registerTool("diff_trace_execution", {
    description: "Compare the execution paths and data differences between two requests (usually one successful and one failed) to identify the root cause of bugs.",
    inputSchema: z.object({
      projectId: z.string().describe("The unique identifier of the project."),
      baseTraceId: z.string().describe("Trace ID where the failure occurred."),
      compareTraceId: z.string().describe("Optional: Trace ID of a successful request for comparison. If not provided, the system will automatically find a successful record for the same method.").optional()
    }),
  }, async (args) => await handleToolCall("diff_trace_execution", args));

  server.registerTool("setup_project", {
    description: "Initialize or retrieve a specific project's configuration by its path. Use this when you have a local project path and need its 'projectId'. If you want to see already configured projects, use 'get_project_list' first.",
    inputSchema: z.object({
      projectPath: z.string().describe("The local absolute path of the project."),
    }),
  }, async (args: any) => {
    const userId = apiKey || "unknown";
    const startTime = Date.now();
    const toolCallId = posthog.trackToolCall("setup_project", userId, { projectPath: args.projectPath });
    try {
      const result = await handleSetupProject(args, projectManager, apiKey);
      posthog.trackToolSuccess("setup_project", userId, toolCallId, Date.now() - startTime);
      return result;
    } catch (error: any) {
      posthog.trackToolError("setup_project", userId, toolCallId, error.message);
      throw error;
    }
  });

  server.registerTool("get_project_list", {
    description: "List all projects that have already been initialized. This is the preferred way to discover available 'projectId's and their corresponding paths without re-initializing them.",
    inputSchema: z.object({}),
  }, async () => {
    const userId = apiKey || "unknown";
    const startTime = Date.now();
    const toolCallId = posthog.trackToolCall("get_project_list", userId);
    try {
      if (!projectManager) {
        posthog.trackToolError("get_project_list", userId, toolCallId, "Project manager not initialized");
        return {
          content: [{ type: "text", text: "Error: Project manager not initialized" }],
          isError: true
        };
      }
      const projects = projectManager.getAllProjects();
      posthog.trackToolSuccess("get_project_list", userId, toolCallId, Date.now() - startTime, { projectCount: projects.length });
      return {
        content: [{ type: "text", text: JSON.stringify(projects, null, 2) }]
      };
    } catch (error: any) {
      posthog.trackToolError("get_project_list", userId, toolCallId, error.message);
      throw error;
    }
  });

  logger.info("All tools registered successfully");
  logger.info("Creating StdioServerTransport...");

  const stdioServerTransport = new StdioServerTransport();

  logger.info("Connecting MCP Server to stdio...");
  await server.connect(stdioServerTransport);

  logger.info("MCP Server connected to IDE via stdio and ready to serve");
}