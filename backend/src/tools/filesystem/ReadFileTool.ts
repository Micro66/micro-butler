import { ToolExecutionContext, ToolExecutionResult } from '@/types';
import { BaseTool, getToolsLogger } from '../base/BaseTool';

/**
 * 读取文件工具
 */
export class ReadFileTool extends BaseTool {
  name = 'read_file';
  description = 'Read the contents of a file';
  parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file to read'
      }
    },
    required: ['path']
  };

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { path } = context.parameters;
      const fs = await import('node:fs/promises');
      const nodePath = await import('node:path');
      
      // 如果是相对路径，则相对于workspacePath解析
      const resolvedPath = nodePath.isAbsolute(path) 
        ? path 
        : nodePath.resolve(context.workspacePath || process.cwd(), path);
      
      // 安全检查
      if (!context.securityManager?.validateFileAccess(resolvedPath)) {
        throw new Error(`Access denied to file: ${resolvedPath}`);
      }
      
      const content = await fs.readFile(resolvedPath, 'utf-8');
      
      return {
        success: true,
        result: content,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      getToolsLogger().error('Failed to read file', error as Error, { path: context.parameters.path });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }
}