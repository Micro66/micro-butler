import { ToolExecutionContext, ToolExecutionResult } from '@/types';
import { BaseTool, getToolsLogger } from '../base/BaseTool';

/**
 * 移动文件工具
 */
export class MoveFileTool extends BaseTool {
  name = 'move_file';
  description = 'Move or rename a file or directory';
  parameters = {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'The source path'
      },
      destination: {
        type: 'string',
        description: 'The destination path'
      }
    },
    required: ['source', 'destination']
  };

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { source, destination } = context.parameters;
      const fs = await import('node:fs/promises');
      const nodePath = await import('node:path');
      
      // 安全检查
      if (!context.securityManager?.validateFileAccess(source)) {
        throw new Error(`Access denied to source: ${source}`);
      }
      if (!context.securityManager?.validateFileAccess(destination)) {
        throw new Error(`Access denied to destination: ${destination}`);
      }
      
      // 检查源文件是否存在
      try {
        await fs.access(source);
      } catch (error) {
        throw new Error(`Source file or directory not found: ${source}`);
      }
      
      // 确保目标目录存在
      const destDir = nodePath.dirname(destination);
      await fs.mkdir(destDir, { recursive: true });
      
      // 移动文件或目录
      await fs.rename(source, destination);
      
      return {
        success: true,
        result: {
          source: source,
          destination: destination,
          message: `Successfully moved from ${source} to ${destination}`
        },
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      getToolsLogger().error('Failed to move file', error as Error, { 
        source: context.parameters.source,
        destination: context.parameters.destination 
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }
}