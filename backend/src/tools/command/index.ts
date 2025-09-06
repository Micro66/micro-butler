import { ToolDefinition } from '@/types';
import { ExecuteCommandTool } from './ExecuteCommandTool';

/**
 * 命令执行工具组
 */
export class CommandTools {
  name = 'command';
  description = 'Command execution tools';
  tools: ToolDefinition[] = [];

  constructor() {
    this.tools = [
      new ExecuteCommandTool().getDefinition()
    ];
  }
}

// 导出所有工具类
export {
  ExecuteCommandTool
};