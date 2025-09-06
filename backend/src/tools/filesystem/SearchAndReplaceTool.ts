import { ToolExecutionContext, ToolExecutionResult } from '@/types';
import { BaseTool, getToolsLogger } from '../base/BaseTool';

/**
 * 搜索和替换工具
 */
export class SearchAndReplaceTool extends BaseTool {
  name = 'search_and_replace';
  description = 'Search for text in a file and replace it with new text';
  parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the file'
      },
      search_text: {
        type: 'string',
        description: 'The text to search for'
      },
      replace_text: {
        type: 'string',
        description: 'The text to replace with'
      },
      regex: {
        type: 'boolean',
        description: 'Whether to treat search_text as a regular expression',
        default: false
      },
      global: {
        type: 'boolean',
        description: 'Whether to replace all occurrences (default: true)',
        default: true
      },
      case_sensitive: {
        type: 'boolean',
        description: 'Whether the search should be case sensitive',
        default: true
      }
    },
    required: ['path', 'search_text', 'replace_text']
  };

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { 
        path, 
        search_text, 
        replace_text, 
        regex = false, 
        global = true, 
        case_sensitive = true 
      } = context.parameters;
      const fs = await import('node:fs/promises');
      
      // 安全检查
      if (!context.securityManager?.validateFileAccess(path)) {
        throw new Error(`Access denied to file: ${path}`);
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
      
      let newContent: string;
      let replacementCount = 0;
      
      if (regex) {
        // 使用正则表达式
        try {
          const flags = global ? 'g' : '';
          const caseFlag = case_sensitive ? '' : 'i';
          const regexPattern = new RegExp(search_text, flags + caseFlag);
          
          // 计算替换次数
          const matches = fileContent.match(regexPattern);
          replacementCount = matches ? matches.length : 0;
          
          newContent = fileContent.replace(regexPattern, replace_text);
        } catch (error) {
          throw new Error(`Invalid regular expression: ${search_text}`);
        }
      } else {
        // 普通字符串替换
        const searchStr = case_sensitive ? search_text : search_text.toLowerCase();
        const contentToSearch = case_sensitive ? fileContent : fileContent.toLowerCase();
        
        if (global) {
          // 全局替换
          let currentContent = fileContent;
          let searchIndex = 0;
          
          while (true) {
            const index = contentToSearch.indexOf(searchStr, searchIndex);
            if (index === -1) break;
            
            // 替换找到的文本
            currentContent = currentContent.substring(0, index) + 
                           replace_text + 
                           currentContent.substring(index + search_text.length);
            
            replacementCount++;
            searchIndex = index + replace_text.length;
            
            // 更新搜索内容（如果不区分大小写）
            if (!case_sensitive) {
              const newContentToSearch = currentContent.toLowerCase();
              // 重新计算搜索位置
              searchIndex = index + replace_text.length;
            }
          }
          newContent = currentContent;
        } else {
          // 只替换第一个匹配项
          const index = contentToSearch.indexOf(searchStr);
          if (index !== -1) {
            newContent = fileContent.substring(0, index) + 
                        replace_text + 
                        fileContent.substring(index + search_text.length);
            replacementCount = 1;
          } else {
            newContent = fileContent;
          }
        }
      }
      
      // 如果内容有变化，写回文件
      if (newContent !== fileContent) {
        await fs.writeFile(path, newContent, 'utf-8');
      }
      
      return {
        success: true,
        result: {
          file: path,
          replacements_made: replacementCount,
          search_text: search_text,
          replace_text: replace_text,
          regex_used: regex,
          global_replace: global,
          case_sensitive: case_sensitive,
          file_modified: newContent !== fileContent
        },
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      getToolsLogger().error('Failed to search and replace', error as Error, { 
        path: context.parameters.path,
        search_text: context.parameters.search_text 
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }
}