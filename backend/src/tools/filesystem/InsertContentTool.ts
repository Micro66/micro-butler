import { ToolExecutionContext, ToolExecutionResult } from '@/types';
import { BaseTool, getToolsLogger } from '../base/BaseTool';

/**
 * 插入内容工具
 */
export class InsertContentTool extends BaseTool {
  name = 'insert_content';
  description = 'Insert content at a specific line in a file';
  parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file'
      },
      line_number: {
        type: 'number',
        description: 'The line number where to insert content (1-based)'
      },
      content: {
        type: 'string',
        description: 'The content to insert'
      },
      insert_after: {
        type: 'boolean',
        description: 'Whether to insert after the specified line (default: false, insert before)',
        default: false
      }
    },
    required: ['path', 'line_number', 'content']
  };

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { path, line_number, content, insert_after = false } = context.parameters;
      const fs = await import('node:fs/promises');
      
      // 安全检查
      if (!context.securityManager?.validateFileAccess(path)) {
        throw new Error(`Access denied to file: ${path}`);
      }
      
      // 验证行号
      if (line_number < 1) {
        throw new Error('Line number must be greater than 0');
      }
      
      // 读取文件内容
      let fileContent: string;
      try {
        fileContent = await fs.readFile(path, 'utf-8');
      } catch (error) {
        if ((error as any).code === 'ENOENT') {
          throw new Error(`File not found: ${path}`);
        }
        throw error;
      }
      
      const lines = fileContent.split('\n');
      const totalLines = lines.length;
      
      // 计算插入位置
      let insertIndex: number;
      if (insert_after) {
        insertIndex = Math.min(line_number, totalLines);
      } else {
        insertIndex = Math.max(0, line_number - 1);
      }
      
      // 插入内容
      const contentLines = content.split('\n');
      lines.splice(insertIndex, 0, ...contentLines);
      
      // 写回文件
      const newContent = lines.join('\n');
      await fs.writeFile(path, newContent, 'utf-8');
      
      return {
        success: true,
        result: {
          file: path,
          inserted_at_line: insert_after ? line_number + 1 : line_number,
          lines_inserted: contentLines.length,
          total_lines_after: lines.length
        },
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      getToolsLogger().error('Failed to insert content', error as Error, { 
        path: context.parameters.path,
        line_number: context.parameters.line_number 
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }
}