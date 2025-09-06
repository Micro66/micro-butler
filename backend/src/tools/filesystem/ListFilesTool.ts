import { ToolExecutionContext, ToolExecutionResult } from '@/types';
import { BaseTool, getToolsLogger } from '../base/BaseTool';

/**
 * 列出文件工具
 */
export class ListFilesTool extends BaseTool {
  name = 'list_files';
  description = 'List the contents of a directory';
  parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the directory to list'
      },
      recursive: {
        type: 'boolean',
        description: 'Whether to list recursively',
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
        throw new Error(`Access denied to directory: ${resolvedPath}`);
      }
      
      const result: any[] = [];
      
      const listDirectory = async (dirPath: string, depth = 0): Promise<void> => {
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = nodePath.join(dirPath, entry.name);
            const relativePath = nodePath.relative(resolvedPath, fullPath);
            
            const item: any = {
              name: entry.name,
              path: relativePath,
              full_path: fullPath,
              type: entry.isDirectory() ? 'directory' : 'file',
              depth: depth
            };
            
            if (entry.isFile()) {
              try {
                const stats = await fs.stat(fullPath);
                item.size = stats.size;
                item.modified = stats.mtime.toISOString();
              } catch (error) {
                // 忽略无法获取统计信息的文件
              }
            }
            
            result.push(item);
            
            // 递归处理子目录
            if (recursive && entry.isDirectory()) {
              await listDirectory(fullPath, depth + 1);
            }
          }
        } catch (error) {
          // 跳过无法访问的目录
        }
      };
      
      await listDirectory(resolvedPath);
      
      return {
        success: true,
        result: {
          directory: resolvedPath,
          recursive: recursive,
          items: result,
          total_count: result.length
        },
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      getToolsLogger().error('Failed to list files', error as Error, { path: context.parameters.path });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }
}