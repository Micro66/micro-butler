import { Logger } from 'winston';
import { WorkerAgent, Skill, SkillContext, SkillResult, WorkerAgentConfig } from '../WorkerAgent';
import type { Message } from '@a2a-js/sdk';
import { TaskManager } from '@/core/task/TaskManager';

/**
 * 代码分析请求参数
 */
interface CodeAnalysisRequest {
  filePath?: string;
  code?: string;
  analysisType: 'structure' | 'functions' | 'issues' | 'dependencies' | 'complexity';
  options?: {
    includeComments?: boolean;
    includePrivate?: boolean;
    maxDepth?: number;
  };
}

/**
 * 代码分析Agent
 * 提供代码结构分析、问题检测、复杂度计算等功能
 */
export class CodeAnalysisAgent extends WorkerAgent {
  private readonly workspaceRoot: string;

  constructor(
    logger: Logger,
    taskManager: TaskManager,
    config: WorkerAgentConfig,
    workspaceRoot: string
  ) {
    super(logger, taskManager, config);
    this.workspaceRoot = workspaceRoot;
  }

  /**
   * 初始化技能
   */
  protected async initializeSkills(): Promise<void> {
    // 代码结构分析技能
    this.registerSkill({
      id: 'analyze-code-structure',
      name: 'Code Structure Analysis',
      description: 'Analyze code structure including classes, functions, imports and exports',
      inputModes: ['text/plain', 'application/json'],
      outputModes: ['application/json'],
      tags: ['code-analysis', 'structure', 'parsing'],
      execute: async (message: Message, context: SkillContext) => {
        return await this.analyzeCodeStructure(message, context);
      }
    });

    // 代码问题检测技能
    this.registerSkill({
      id: 'detect-code-issues',
      name: 'Code Issue Detection',
      description: 'Detect potential issues, bugs and code smells in source code',
      inputModes: ['text/plain', 'application/json'],
      outputModes: ['application/json'],
      tags: ['code-analysis', 'linting', 'quality'],
      execute: async (message: Message, context: SkillContext) => {
        return await this.detectCodeIssues(message, context);
      }
    });

    // 代码复杂度分析技能
    this.registerSkill({
      id: 'analyze-complexity',
      name: 'Code Complexity Analysis',
      description: 'Calculate cyclomatic complexity and maintainability metrics',
      inputModes: ['text/plain', 'application/json'],
      outputModes: ['application/json'],
      tags: ['code-analysis', 'complexity', 'metrics'],
      execute: async (message: Message, context: SkillContext) => {
        return await this.analyzeComplexity(message, context);
      }
    });

    // 依赖分析技能
    this.registerSkill({
      id: 'analyze-dependencies',
      name: 'Dependency Analysis',
      description: 'Analyze project dependencies and import relationships',
      inputModes: ['text/plain', 'application/json'],
      outputModes: ['application/json'],
      tags: ['code-analysis', 'dependencies', 'imports'],
      execute: async (message: Message, context: SkillContext) => {
        return await this.analyzeDependencies(message, context);
      }
    });
  }

  /**
   * 分析代码结构
   */
  private async analyzeCodeStructure(message: Message, context: SkillContext): Promise<SkillResult> {
    const startTime = Date.now();
    
    try {
      const request = JSON.parse(message.parts.find(part => part.kind === 'text')?.text || '{}') as CodeAnalysisRequest;
      const code = await this.getCodeContent(request);
      
      // 简单的代码结构分析
      const structure = {
        classes: this.extractClasses(code),
        functions: this.extractFunctions(code),
        imports: this.extractImports(code),
        exports: this.extractExports(code)
      };

      const response = {
        analysisType: 'structure',
        results: { structure },
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          fileSize: code.length
        }
      };

      return {
        success: true,
        result: response,
        metadata: response.metadata
      };
    } catch (error) {
      this.logger.error('Code structure analysis failed', { error: (error as Error).message });
      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          processingTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * 检测代码问题
   */
  private async detectCodeIssues(message: Message, context: SkillContext): Promise<SkillResult> {
    const startTime = Date.now();
    
    try {
      const request = JSON.parse(message.parts.find(part => part.kind === 'text')?.text || '{}') as CodeAnalysisRequest;
      const code = await this.getCodeContent(request);
      
      // 简单的问题检测
      const issues = this.detectComplexConditions(code);

      const response = {
        analysisType: 'issues',
        results: { issues },
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          fileSize: code.length
        }
      };

      return {
        success: true,
        result: response,
        metadata: response.metadata
      };
    } catch (error) {
      this.logger.error('Code issue detection failed', { error: (error as Error).message });
      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          processingTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * 分析代码复杂度
   */
  private async analyzeComplexity(message: Message, context: SkillContext): Promise<SkillResult> {
    const startTime = Date.now();
    
    try {
      const request = JSON.parse(message.parts.find(part => part.kind === 'text')?.text || '{}') as CodeAnalysisRequest;
      const code = await this.getCodeContent(request);
      
      const complexity = {
        cyclomaticComplexity: this.calculateCyclomaticComplexity(code),
        linesOfCode: code.split('\n').length,
        maintainabilityIndex: this.calculateMaintainabilityIndex(code)
      };

      const response = {
        analysisType: 'complexity',
        results: { complexity },
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          fileSize: code.length
        }
      };

      return {
        success: true,
        result: response,
        metadata: response.metadata
      };
    } catch (error) {
      this.logger.error('Code complexity analysis failed', { error: (error as Error).message });
      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          processingTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * 分析依赖关系
   */
  private async analyzeDependencies(message: Message, context: SkillContext): Promise<SkillResult> {
    const startTime = Date.now();
    
    try {
      const request = JSON.parse(message.parts.find(part => part.kind === 'text')?.text || '{}') as CodeAnalysisRequest;
      const code = await this.getCodeContent(request);
      
      const dependencies = {
        internal: this.extractInternalDependencies(code),
        external: this.extractExternalDependencies(code),
        devDependencies: []
      };

      const response = {
        analysisType: 'dependencies',
        results: { dependencies },
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          fileSize: code.length
        }
      };

      return {
        success: true,
        result: response,
        metadata: response.metadata
      };
    } catch (error) {
      this.logger.error('Dependency analysis failed', { error: (error as Error).message });
      return {
        success: false,
        error: (error as Error).message,
        metadata: {
          processingTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   * 获取代码内容
   */
  private async getCodeContent(request: CodeAnalysisRequest): Promise<string> {
    if (request.code) {
      return request.code;
    }
    
    if (request.filePath) {
      const fs = await import('fs/promises');
      const path = await import('path');
      const fullPath = path.resolve(this.workspaceRoot, request.filePath);
      return await fs.readFile(fullPath, 'utf-8');
    }
    
    throw new Error('Either code or filePath must be provided');
  }

  // 简化的代码分析方法
  
  private extractClasses(code: string) {
    const classRegex = /class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?\s*{/g;
    const classes = [];
    let match;
    
    while ((match = classRegex.exec(code)) !== null) {
      classes.push({
        name: match[1] || 'Unknown',
        methods: [],
        properties: [],
        extends: match[2],
        implements: match[3] ? match[3].split(',').map(i => i.trim()) : undefined
      });
    }
    
    return classes;
  }

  private extractFunctions(code: string) {
    const functionRegex = /(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)|(?:async\s+)?(\w+)\s*:\s*\([^)]*\)\s*=>/g;
    const functions = [];
    let match;
    
    while ((match = functionRegex.exec(code)) !== null) {
      functions.push({
        name: match[1] || match[3] || 'Unknown',
        parameters: match[2] ? match[2].split(',').map(p => p.trim()) : [],
        returnType: undefined,
        isAsync: match[0].includes('async')
      });
    }
    
    return functions;
  }

  private extractImports(code: string): string[] {
    const importRegex = /import\s+.*?from\s+['"]([^'"]+)['"]/g;
    const imports = [];
    let match;
    
    while ((match = importRegex.exec(code)) !== null) {
      if (match[1]) {
        imports.push(match[1]);
      }
    }
    
    return imports;
  }

  private extractExports(code: string): string[] {
    const exportRegex = /export\s+(?:default\s+)?(?:class|function|const|let|var)\s+(\w+)/g;
    const exports = [];
    let match;
    
    while ((match = exportRegex.exec(code)) !== null) {
      if (match[1]) {
        exports.push(match[1]);
      }
    }
    
    return exports;
  }

  private detectComplexConditions(code: string) {
    const issues = [];
    const complexConditionRegex = /if\s*\([^)]*&&[^)]*&&[^)]*\)/g;
    let match;
    
    while ((match = complexConditionRegex.exec(code)) !== null) {
      issues.push({
        type: 'warning' as const,
        message: 'Complex condition detected, consider refactoring',
        line: code.substring(0, match.index).split('\n').length,
        rule: 'complex-condition'
      });
    }
    
    return issues;
  }

  private calculateCyclomaticComplexity(code: string): number {
    const decisionPoints = (code.match(/if|while|for|case|catch|&&|\|\|/g) || []).length;
    return decisionPoints + 1;
  }

  private calculateMaintainabilityIndex(code: string): number {
    const linesOfCode = code.split('\n').length;
    const complexity = this.calculateCyclomaticComplexity(code);
    return Math.max(0, 171 - 5.2 * Math.log(linesOfCode) - 0.23 * complexity);
  }

  private extractInternalDependencies(code: string): string[] {
    const imports = this.extractImports(code);
    return imports.filter(imp => imp.startsWith('.') || imp.startsWith('/'));
  }

  private extractExternalDependencies(code: string): string[] {
    const imports = this.extractImports(code);
    return imports.filter(imp => !imp.startsWith('.') && !imp.startsWith('/'));
  }
}

/**
 * 创建代码分析Agent的工厂函数
 */
export function createCodeAnalysisAgent(
  logger: Logger,
  taskManager: TaskManager,
  workspaceRoot: string,
  config?: Partial<WorkerAgentConfig>
): CodeAnalysisAgent {
  const defaultConfig: WorkerAgentConfig = {
    agentId: 'code-analysis-agent',
    name: 'Code Analysis Agent',
    description: 'Analyzes code structure, detects issues, and calculates complexity metrics',
    version: '1.0.0',
    url: 'http://localhost:3001/agents/code-analysis',
    maxConcurrentTasks: 5,
    healthCheckInterval: 30000,
    ...config
  };

  return new CodeAnalysisAgent(logger, taskManager, defaultConfig, workspaceRoot);
}