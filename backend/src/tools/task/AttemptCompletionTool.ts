import { ToolExecutionContext, ToolExecutionResult } from '@/types';
import { BaseTool, getToolsLogger } from '../base/BaseTool';

/**
 * 尝试完成任务工具
 */
export class AttemptCompletionTool extends BaseTool {
  name = 'attempt_completion';
  description = 'Present the result of the task to the user after confirming all previous tool uses were successful';
  parameters = {
    type: 'object',
    properties: {
      result: {
        type: 'string',
        description: 'The final result of the task. Should be formulated in a way that is final and does not require further input from the user.'
      }
    },
    required: ['result']
  };

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { result } = context.parameters;
      
      // 记录任务完成
      getToolsLogger().info('Task completion attempted', { result });
      
      // 构建完成结果
      const completionResult = {
        type: 'task_completion',
        result,
        timestamp: new Date().toISOString(),
        session_id: (context as any).sessionId || 'unknown',
        message: 'Task has been completed successfully'
      };
      
      return {
        success: true,
        result: completionResult,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      getToolsLogger().error('Failed to complete task', error as Error, { 
        result: context.parameters.result 
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }
}