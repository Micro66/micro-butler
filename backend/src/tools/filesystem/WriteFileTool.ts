import { ToolExecutionContext, ToolExecutionResult } from '@/types';
import { BaseTool, getToolsLogger } from '../base/BaseTool';

/**
 * 写入文件工具
 */
export class WriteFileTool extends BaseTool {
  name = 'write_file';
  description = 'Write content to a file';
  parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file to write'
      },
      content: {
        type: 'string',
        description: 'The content to write to the file'
      },
      create_directories: {
        type: 'boolean',
        description: 'Whether to create parent directories if they do not exist',
        default: false
      }
    },
    required: ['path', 'content']
  };

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { path, content, create_directories } = context.parameters;
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
      
      // 创建父目录（如果需要）
      if (create_directories) {
        const dir = nodePath.dirname(resolvedPath);
        await fs.mkdir(dir, { recursive: true });
      }
      
      await fs.writeFile(resolvedPath, content, 'utf-8');
      
      return {
        success: true,
        result: `File written successfully: ${resolvedPath}`,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      getToolsLogger().error('Failed to write file', error as Error, { path: context.parameters.path });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }
}