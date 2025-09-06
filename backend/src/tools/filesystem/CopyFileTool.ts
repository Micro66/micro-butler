import { ToolExecutionContext, ToolExecutionResult } from '@/types';
import { BaseTool, getToolsLogger } from '../base/BaseTool';

/**
 * 复制文件工具
 */
export class CopyFileTool extends BaseTool {
  name = 'copy_file';
  description = 'Copy a file or directory';
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
      },
      recursive: {
        type: 'boolean',
        description: 'Whether to copy directories recursively',
        default: false
      }
    },
    required: ['source', 'destination']
  };

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { source, destination, recursive = false } = context.parameters;
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
      let sourceStats;
      try {
        sourceStats = await fs.stat(source);
      } catch (error) {
        throw new Error(`Source file or directory not found: ${source}`);
      }
      
      // 确保目标目录存在
      const destDir = nodePath.dirname(destination);
      await fs.mkdir(destDir, { recursive: true });
      
      if (sourceStats.isDirectory()) {
        if (!recursive) {
          throw new Error('Cannot copy directory without recursive flag');
        }
        await this.copyDirectory(source, destination, fs, nodePath);
      } else {
        await fs.copyFile(source, destination);
      }
      
      return {
        success: true,
        result: {
          source: source,
          destination: destination,
          type: sourceStats.isDirectory() ? 'directory' : 'file',
          message: `Successfully copied from ${source} to ${destination}`
        },
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      getToolsLogger().error('Failed to copy file', error as Error, { 
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

  private async copyDirectory(source: string, destination: string, fs: any, nodePath: any): Promise<void> {
    // 创建目标目录
    await fs.mkdir(destination, { recursive: true });
    
    // 读取源目录内容
    const entries = await fs.readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourcePath = nodePath.join(source, entry.name);
      const destPath = nodePath.join(destination, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, destPath, fs, nodePath);
      } else {
        await fs.copyFile(sourcePath, destPath);
      }
    }
  }
}