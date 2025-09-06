import { ToolDefinition } from '@/types';
import { UpdateTodoListTool } from './UpdateTodoListTool';
import { AttemptCompletionTool } from './AttemptCompletionTool';

/**
 * 任务管理工具组
 */
export class TaskTools {
  name = 'task';
  description = 'Task management tools';
  tools: ToolDefinition[] = [];

  constructor() {
    this.tools = [
      new UpdateTodoListTool().getDefinition(),
      new AttemptCompletionTool().getDefinition()
    ];
  }
}

// 导出所有工具类
export {
  UpdateTodoListTool,
  AttemptCompletionTool
};