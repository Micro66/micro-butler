import { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '@/types';
import { getLogger } from '../../utils/Logger';

// 延迟初始化logger，避免在模块加载时就调用
let logger: any = null;
export function getToolsLogger() {
  if (!logger) {
    logger = getLogger('tools');
  }
  return logger;
}

/**
 * 基础工具类
 */
export abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract parameters: any;

  /**
   * 执行工具
   */
  abstract execute(context: ToolExecutionContext): Promise<ToolExecutionResult>;

  /**
   * 验证参数
   */
  validateParameters(params: any): boolean {
    // 默认实现，子类可以重写
    return true;
  }

  /**
   * 获取工具定义
   */
  getDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
      group: 'command' as any,
      execute: this.execute.bind(this)
    };
  }
}