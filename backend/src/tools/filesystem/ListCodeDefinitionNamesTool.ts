import { ToolExecutionContext, ToolExecutionResult } from '@/types';
import { BaseTool, getToolsLogger } from '../base/BaseTool';

/**
 * 列出代码定义名称工具
 */
export class ListCodeDefinitionNamesTool extends BaseTool {
  name = 'list_code_definition_names';
  description = 'List function and class definition names in code files';
  parameters = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The file path to analyze'
      },
      language: {
        type: 'string',
        description: 'Programming language (auto-detect if not specified)',
        enum: ['javascript', 'typescript', 'python', 'java', 'cpp', 'c', 'go', 'rust', 'auto']
      }
    },
    required: ['path']
  };

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { path, language = 'auto' } = context.parameters;
      const fs = await import('node:fs/promises');
      const nodePath = await import('node:path');
      
      // 安全检查
      if (!context.securityManager?.validateFileAccess(path)) {
        throw new Error(`Access denied to file: ${path}`);
      }
      
      const content = await fs.readFile(path, 'utf-8');
      const ext = nodePath.extname(path).toLowerCase();
      
      // 自动检测语言
      let detectedLanguage = language;
      if (language === 'auto') {
        const langMap: { [key: string]: string } = {
          '.js': 'javascript',
          '.jsx': 'javascript',
          '.ts': 'typescript',
          '.tsx': 'typescript',
          '.py': 'python',
          '.java': 'java',
          '.cpp': 'cpp',
          '.cc': 'cpp',
          '.cxx': 'cpp',
          '.c': 'c',
          '.h': 'c',
          '.go': 'go',
          '.rs': 'rust'
        };
        detectedLanguage = langMap[ext] || 'unknown';
      }
      
      const definitions = this.extractDefinitions(content, detectedLanguage);
      
      return {
        success: true,
        result: {
          file: path,
          language: detectedLanguage,
          definitions: definitions,
          total_count: definitions.length
        },
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      getToolsLogger().error('Failed to list code definitions', error as Error, { 
        path: context.parameters.path 
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }

  private extractDefinitions(content: string, language: string): Array<{ name: string; type: string; line: number }> {
    const definitions: Array<{ name: string; type: string; line: number }> = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
       const line = lines[i];
       if (!line) continue;
       const trimmedLine = line.trim();
       const lineNumber = i + 1;
      
      switch (language) {
        case 'javascript':
         case 'typescript':
           this.extractJSDefinitions(trimmedLine, lineNumber, definitions);
           break;
         case 'python':
           this.extractPythonDefinitions(trimmedLine, lineNumber, definitions);
           break;
         case 'java':
           this.extractJavaDefinitions(trimmedLine, lineNumber, definitions);
           break;
         case 'cpp':
         case 'c':
           this.extractCDefinitions(trimmedLine, lineNumber, definitions);
           break;
         case 'go':
           this.extractGoDefinitions(trimmedLine, lineNumber, definitions);
           break;
         case 'rust':
           this.extractRustDefinitions(trimmedLine, lineNumber, definitions);
          break;
      }
    }
    
    return definitions;
  }

  private extractJSDefinitions(line: string, lineNumber: number, definitions: Array<{ name: string; type: string; line: number }>) {
    // 函数声明
     const funcMatch = line.match(/^(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
     const funcName = funcMatch?.[1];
    if (funcName) {
       definitions.push({ name: funcName, type: 'function', line: lineNumber });
       return;
     }
    
    // 箭头函数
     const arrowMatch = line.match(/^(?:export\s+)?(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/);
     const arrowName = arrowMatch?.[1];
    if (arrowName) {
       definitions.push({ name: arrowName, type: 'function', line: lineNumber });
       return;
     }
    
    // 类声明
     const classMatch = line.match(/^(?:export\s+)?(?:abstract\s+)?class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
     const className = classMatch?.[1];
    if (className) {
       definitions.push({ name: className, type: 'class', line: lineNumber });
       return;
     }
    
    // 接口声明 (TypeScript)
     const interfaceMatch = line.match(/^(?:export\s+)?interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
     const interfaceName = interfaceMatch?.[1];
    if (interfaceName) {
       definitions.push({ name: interfaceName, type: 'interface', line: lineNumber });
       return;
     }
    
    // 类型别名 (TypeScript)
     const typeMatch = line.match(/^(?:export\s+)?type\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
     const typeName = typeMatch?.[1];
    if (typeName) {
       definitions.push({ name: typeName, type: 'type', line: lineNumber });
     }
  }

  private extractPythonDefinitions(line: string, lineNumber: number, definitions: Array<{ name: string; type: string; line: number }>) {
     // 函数定义
     const funcMatch = line.match(/^(?:\s*)(?:async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
     const funcName = funcMatch?.[1];
     if (funcName) {
       definitions.push({ name: funcName, type: 'function', line: lineNumber });
       return;
     }
     
     // 类定义
     const classMatch = line.match(/^(?:\s*)class\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
     const className = classMatch?.[1];
     if (className) {
       definitions.push({ name: className, type: 'class', line: lineNumber });
     }
   }

  private extractJavaDefinitions(line: string, lineNumber: number, definitions: Array<{ name: string; type: string; line: number }>) {
     // 类定义
     const classMatch = line.match(/^(?:\s*)(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?class\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
     const className = classMatch?.[1];
     if (className) {
       definitions.push({ name: className, type: 'class', line: lineNumber });
       return;
     }
     
     // 接口定义
     const interfaceMatch = line.match(/^(?:\s*)(?:public\s+)?interface\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
     const interfaceName = interfaceMatch?.[1];
     if (interfaceName) {
       definitions.push({ name: interfaceName, type: 'interface', line: lineNumber });
       return;
     }
     
     // 方法定义
     const methodMatch = line.match(/^(?:\s*)(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:final\s+)?[a-zA-Z_<>\[\]]+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
     const methodName = methodMatch?.[1];
     if (methodName && !line.includes('=')) {
       definitions.push({ name: methodName, type: 'method', line: lineNumber });
     }
   }

  private extractCDefinitions(line: string, lineNumber: number, definitions: Array<{ name: string; type: string; line: number }>) {
     // 函数定义
     const funcMatch = line.match(/^(?:\s*)[a-zA-Z_*\s]+\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*\{?\s*$/);
     const funcName = funcMatch?.[1];
     if (funcName && !line.includes(';')) {
       definitions.push({ name: funcName, type: 'function', line: lineNumber });
       return;
     }
     
     // 结构体定义
     const structMatch = line.match(/^(?:\s*)(?:typedef\s+)?struct\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
     const structName = structMatch?.[1];
     if (structName) {
       definitions.push({ name: structName, type: 'struct', line: lineNumber });
     }
   }

  private extractGoDefinitions(line: string, lineNumber: number, definitions: Array<{ name: string; type: string; line: number }>) {
     // 函数定义
     const funcMatch = line.match(/^func\s+(?:\([^)]*\)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
     const funcName = funcMatch?.[1];
     if (funcName) {
       definitions.push({ name: funcName, type: 'function', line: lineNumber });
       return;
     }
     
     // 类型定义
     const typeMatch = line.match(/^type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:struct|interface)/);
     const typeName = typeMatch?.[1];
     if (typeName) {
       definitions.push({ name: typeName, type: 'type', line: lineNumber });
     }
   }

  private extractRustDefinitions(line: string, lineNumber: number, definitions: Array<{ name: string; type: string; line: number }>) {
     // 函数定义
     const funcMatch = line.match(/^(?:\s*)(?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
     const funcName = funcMatch?.[1];
     if (funcName) {
       definitions.push({ name: funcName, type: 'function', line: lineNumber });
       return;
     }
     
     // 结构体定义
     const structMatch = line.match(/^(?:\s*)(?:pub\s+)?struct\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
     const structName = structMatch?.[1];
     if (structName) {
       definitions.push({ name: structName, type: 'struct', line: lineNumber });
       return;
     }
     
     // 枚举定义
     const enumMatch = line.match(/^(?:\s*)(?:pub\s+)?enum\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
     const enumName = enumMatch?.[1];
     if (enumName) {
       definitions.push({ name: enumName, type: 'enum', line: lineNumber });
     }
   }
}