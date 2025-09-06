import { ToolCall, ToolDefinition, ToolExecutionContext, ToolExecutionResult, ToolGroup } from '@/types';
import { ToolGroupInstance } from '@/tools';
import { EventEmitter } from 'node:events';
import { Logger } from 'winston';

export class ToolExecutor extends EventEmitter {
  private tools: Map<string, ToolDefinition> = new Map();
  private logger: Logger;
  private securityManager: any; // 临时类型，后续会创建具体的 SecurityManager

  constructor(logger: Logger, securityManager: any) {
    super();
    this.logger = logger;
    this.securityManager = securityManager;
  }

  /**
   * 注册工具组
   */
  registerToolGroup(group: ToolGroupInstance): void {
    for (const tool of group.tools || []) {
      this.tools.set(tool.name, tool);
      this.logger.debug(`Registered tool: ${tool.name}`);
    }
  }

  /**
   * 获取所有可用工具
   */
  getAvailableTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * 执行工具调用
   */
  async executeTool(
    toolCall: ToolCall,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      // 验证工具是否存在
      const tool = this.tools.get(toolCall.name);
      if (!tool) {
        throw new Error(`Tool '${toolCall.name}' not found`);
      }

      // 安全检查
      await this.securityManager.validateToolExecution(toolCall, context);

      // 验证参数
      this.validateToolParameters(tool, toolCall.parameters);

      this.logger.info(`Executing tool: ${toolCall.name}`);
      this.emit('toolExecutionStart', { toolCall, context });

      // 执行工具
      const result = await tool.execute(context);

      const executionTime = Date.now() - startTime;
      this.logger.info(`Tool '${toolCall.name}' executed successfully in ${executionTime}ms`);
      
      const executionResult: ToolExecutionResult = {
          success: result.success,
          result,
          executionTime
        };

        this.emit('toolExecutionComplete', { toolCall, context: context as any, result: executionResult });
      return executionResult;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error(`Tool '${toolCall.name}' execution failed: ${errorMessage}`);
      
      const executionResult: ToolExecutionResult = {
        success: false,
        error: errorMessage,
        executionTime,
        // toolName: toolCall.name // Removed as not part of ToolExecutionResult type
      };

      this.emit('toolExecutionError', { toolCall, context, error: executionResult });
      return executionResult;
    }
  }

  /**
   * 批量执行工具调用
   */
  async executeTools(
    toolCalls: ToolCall[],
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    
    for (const toolCall of toolCalls) {
      const result = await this.executeTool(toolCall, context);
      results.push(result);
      
      // 如果工具执行失败且配置为停止执行，则中断
      if (!result.success && (context as any).stopOnError) {
        break;
      }
    }
    
    return results;
  }

  /**
   * 验证工具参数
   */
  private validateToolParameters(tool: ToolDefinition, parameters: any): void {
    if (!tool.parameters) {
      return;
    }

    // 基本的参数验证逻辑
    // 这里可以根据工具定义中的参数模式进行更详细的验证
    if (tool.parameters.required) {
      for (const requiredParam of tool.parameters.required) {
        if (!(requiredParam in parameters)) {
          throw new Error(`Missing required parameter: ${requiredParam}`);
        }
      }
    }
  }

  /**
   * 获取工具定义
   */
  getToolDefinition(toolName: string): ToolDefinition | undefined {
    return this.tools.get(toolName);
  }

  /**
   * 检查工具是否可用
   */
  isToolAvailable(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    this.tools.clear();
    this.removeAllListeners();
  }
}