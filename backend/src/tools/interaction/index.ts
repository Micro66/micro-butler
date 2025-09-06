import { ToolDefinition } from '@/types';
import { AskFollowupQuestionTool } from './AskFollowupQuestionTool';

/**
 * 交互工具组
 */
export class InteractionTools {
  name = 'interaction';
  description = 'User interaction tools';
  tools: ToolDefinition[] = [];

  constructor() {
    this.tools = [
      new AskFollowupQuestionTool().getDefinition()
    ];
  }
}

// 导出所有工具类
export {
  AskFollowupQuestionTool
};