import { EventEmitter } from 'node:events';
import { Logger } from 'winston';
import { ToolDefinition, ToolGroup, ToolCall, ToolExecutionContext, ToolExecutionResult } from '../../types/index.js';
import { SecurityManager } from '../security/SecurityManager.js';
import { TOOL_GROUPS, ALWAYS_AVAILABLE_TOOLS, ToolGroupConfig } from '../../shared/tools';

interface ToolRegistryOptions {
  enableSecurity?: boolean
  allowedTools?: string[]
  blockedTools?: string[]
}

/**
 * 工具注册表 - 管理所有可用工具的注册和查找
 */
export class ToolRegistry extends EventEmitter {
  private tools: Map<string, ToolDefinition> = new Map();
  private logger: Logger;
  private securityManager: SecurityManager;
  private options: ToolRegistryOptions;

  constructor(logger: Logger, securityManager: SecurityManager, options: ToolRegistryOptions = {}) {
    super();
    this.logger = logger;
    this.securityManager = securityManager;
    this.options = options;
  }

  /**
   * 注册工具组
   */
  registerToolGroup(groupName: ToolGroup): void {
    const config = TOOL_GROUPS[groupName];
    if (!config) {
      throw new Error(`Unknown tool group: ${groupName}`);
    }
    
    this.logger.info(`Registered tool group: ${groupName} with ${config.tools.length} tools`);
    this.emit('toolGroupRegistered', { name: groupName, config });
  }

  /**
   * 注册单个工具
   */
  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
    this.logger.debug(`Registered tool: ${tool.name}`);
    this.emit('toolRegistered', tool);
  }

  /**
   * 获取工具定义
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取所有工具
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * 获取工具组
   */
  getToolGroup(groupName: ToolGroup): ToolGroupConfig | undefined {
    return TOOL_GROUPS[groupName];
  }

  /**
   * 获取所有工具组
   */
  getAllToolGroups(): Record<ToolGroup, ToolGroupConfig> {
    return { ...TOOL_GROUPS };
  }

  /**
   * 检查工具是否存在
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * 根据模式获取可用工具
   */
  getToolsForMode(mode: string): ToolDefinition[] {
    return this.getAllTools();
  }

  /**
   * 验证工具调用是否被允许
   */
  async validateToolCall(toolCall: ToolCall, context: ToolExecutionContext): Promise<boolean> {
    const tool = this.getTool(toolCall.name);
    if (!tool) {
      return false;
    }

    // 使用安全管理器验证
    try {
      await this.securityManager.validateToolExecution(toolCall, context);
      return true;
    } catch (error) {
      this.logger.warn(`Tool call validation failed: ${error}`);
      return false;
    }
  }

  /**
   * 获取工具的描述信息
   */
  getToolDescription(name: string): string | undefined {
    const tool = this.getTool(name);
    return tool?.description;
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    this.tools.clear();
    this.removeAllListeners();
    this.logger.info('Tool registry cleaned up');
  }
}