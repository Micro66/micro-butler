import { ToolExecutionContext, ToolExecutionResult } from '@/types';
import { BaseTool, getToolsLogger } from '../base/BaseTool';

/**
 * 搜索文件工具
 */
export class SearchFilesTool extends BaseTool {
  name = 'search_files';
  description = 'Search for files and content within files using regex patterns';
  parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The directory path to search in'
      },
      regex: {
        type: 'string',
        description: 'The regex pattern to search for'
      },
      file_pattern: {
        type: 'string',
        description: 'Optional file name pattern to filter files (glob pattern)',
        default: '*'
      },
      include_line_numbers: {
        type: 'boolean',
        description: 'Whether to include line numbers in results',
        default: true
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: 100
      }
    },
    required: ['path', 'regex']
  };

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { path, regex, file_pattern = '*', include_line_numbers = true, max_results = 100 } = context.parameters;
      const fs = await import('node:fs/promises');
      const nodePath = await import('node:path');
      
      // 安全检查
      if (!context.securityManager?.validateFileAccess(path)) {
        throw new Error(`Access denied to directory: ${path}`);
      }
      
      // 创建正则表达式
      const regexPattern = new RegExp(regex, 'gi');
      
      // 递归查找文件
      const files: string[] = [];
      
      const findFiles = async (dir: string): Promise<void> => {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          
          for (const entry of entries) {
            const fullPath = nodePath.join(dir, entry.name);
            
            if (entry.isDirectory()) {
              await findFiles(fullPath);
            } else if (entry.isFile()) {
              // 简单的文件名匹配
              if (file_pattern === '*' || entry.name.includes(file_pattern.replace('*', ''))) {
                files.push(fullPath);
              }
            }
          }
        } catch (error) {
          // 跳过无法访问的目录
        }
      };
      
      await findFiles(path);
      
      const results = [];
      let resultCount = 0;
      
      for (const file of files) {
        if (resultCount >= max_results) break;
        
        try {
          const content = await fs.readFile(file, 'utf-8');
          const lines = content.split('\n');
          
          for (let i = 0; i < lines.length; i++) {
            if (resultCount >= max_results) break;
            
            const line = lines[i];
            if (line !== undefined) {
              const matches = line.match(regexPattern);
              
              if (matches) {
                results.push({
                  file: nodePath.relative(path, file),
                  line: include_line_numbers ? i + 1 : undefined,
                  content: line.trim(),
                  matches: matches
                });
                resultCount++;
              }
            }
          }
        } catch (error) {
          // 跳过无法读取的文件（如二进制文件）
          continue;
        }
      }
      
      return {
        success: true,
        result: {
          matches: results,
          total_files_searched: files.length,
          total_matches: results.length,
          search_pattern: regex,
          search_path: path
        },
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      getToolsLogger().error('Failed to search files', error as Error, { 
        path: context.parameters.path,
        regex: context.parameters.regex 
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }
}