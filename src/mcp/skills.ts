import { logger } from "../common/logger.js";
import { ProjectManager } from "../common/project-manager.js";

export async function handleSetupProject(args: any, projectManager?: ProjectManager, apiKey?: string) {
    const name = "setup_project";
    logger.info({ tool: name, args }, `Calling tool ${name}`);

    try {
        if (!projectManager) {
            throw new Error("ProjectManager not initialized");
        }

        const config = await projectManager.ensureProject(args.projectPath);

        const result = {
            projectName: config.projectName,
            projectId: config.projectId,
            apiKey: apiKey || "" // Return passed apiKey
        };

        return {
            content: [
                {
                    type: "text" as const,
                    text: JSON.stringify(result, null, 2)
                }
            ]
        };
    } catch (error: any) {
        logger.error({ tool: name, error: error.message }, `Tool ${name} failed`);
        return {
            content: [{ type: "text" as const, text: `Error: ${error.message}` }],
            isError: true
        };
    }
}
