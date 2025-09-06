import { ToolDefinition } from '@/types';
import { BrowserActionTool } from './BrowserActionTool';

/**
 * 浏览器自动化工具组
 */
export class BrowserTools {
  name = 'browser';
  description = 'Browser automation tools';
  tools: ToolDefinition[] = [];

  constructor() {
    this.tools = [
      new BrowserActionTool().getDefinition()
    ];
  }
}

// 导出所有工具类
export {
  BrowserActionTool
};