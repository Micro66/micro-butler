import { ToolExecutionContext, ToolExecutionResult } from '@/types';
import { BaseTool, getToolsLogger } from '../base/BaseTool';

/**
 * 创建目录工具
 */
export class CreateDirectoryTool extends BaseTool {
  name = 'create_directory';
  description = 'Create a directory';
  parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path of the directory to create'
      },
      recursive: {
        type: 'boolean',
        description: 'Whether to create parent directories if they do not exist',
        default: true
      }
    },
    required: ['path']
  };

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { path, recursive = true } = context.parameters;
      const fs = await import('node:fs/promises');
      const nodePath = await import('node:path');
      
      // 如果是相对路径，则相对于workspacePath解析
      const resolvedPath = nodePath.isAbsolute(path) 
        ? path 
        : nodePath.resolve(context.workspacePath || process.cwd(), path);
      
      // 安全检查
      if (!context.securityManager?.validateFileAccess(resolvedPath)) {
        throw new Error(`Access denied to create directory: ${resolvedPath}`);
      }
      
      await fs.mkdir(resolvedPath, { recursive });
      
      return {
        success: true,
        result: `Directory created successfully: ${resolvedPath}`,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      getToolsLogger().error('Failed to create directory', error as Error, { path: context.parameters.path });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }
}