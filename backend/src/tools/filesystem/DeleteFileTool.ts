import { ToolExecutionContext, ToolExecutionResult } from '@/types';
import { BaseTool, getToolsLogger } from '../base/BaseTool';

/**
 * 删除文件工具
 */
export class DeleteFileTool extends BaseTool {
  name = 'delete_file';
  description = 'Delete a file or directory';
  parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file or directory to delete'
      },
      recursive: {
        type: 'boolean',
        description: 'Whether to delete directories recursively',
        default: false
      }
    },
    required: ['path']
  };

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { path, recursive = false } = context.parameters;
      const fs = await import('node:fs/promises');
      const nodePath = await import('node:path');
      
      // 如果是相对路径，则相对于workspacePath解析
      const resolvedPath = nodePath.isAbsolute(path) 
        ? path 
        : nodePath.resolve(context.workspacePath || process.cwd(), path);
      
      // 安全检查
      if (!context.securityManager?.validateFileAccess(resolvedPath)) {
        throw new Error(`Access denied to delete: ${resolvedPath}`);
      }
      
      // 检查路径是否存在
      try {
        const stats = await fs.stat(resolvedPath);
        
        if (stats.isDirectory()) {
          await fs.rmdir(resolvedPath, { recursive });
        } else {
          await fs.unlink(resolvedPath);
        }
      } catch (error) {
        if ((error as any).code === 'ENOENT') {
          throw new Error(`File or directory not found: ${resolvedPath}`);
        }
        throw error;
      }
      
      return {
        success: true,
        result: `Successfully deleted: ${resolvedPath}`,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      getToolsLogger().error('Failed to delete file', error as Error, { path: context.parameters.path });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }
}