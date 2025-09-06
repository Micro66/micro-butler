import { ToolExecutionContext, ToolExecutionResult } from '@/types';
import { BaseTool, getToolsLogger } from '../base/BaseTool';

/**
 * 询问后续问题工具
 */
export class AskFollowupQuestionTool extends BaseTool {
  name = 'ask_followup_question';
  description = 'Ask the user a follow-up question to gather more information';
  parameters = {
    type: 'object',
    properties: {
      question: {
        type: 'string',
        description: 'The question to ask the user'
      },
      context: {
        type: 'string',
        description: 'Additional context about why this question is being asked',
        default: ''
      },
      options: {
        type: 'array',
        description: 'Optional list of suggested answers or choices',
        items: {
          type: 'string'
        },
        default: []
      }
    },
    required: ['question']
  };

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { question, context: questionContext = '', options = [] } = context.parameters;
      
      // 构建问题结构
      const questionData = {
        question,
        context: questionContext,
        options,
        timestamp: new Date().toISOString(),
        session_id: (context as any).sessionId || 'unknown'
      };
      
      // 记录问题
      getToolsLogger().info('Follow-up question asked', { 
        question, 
        context: questionContext, 
        options 
      });
      
      // 在实际实现中，这里应该通过某种机制（如WebSocket、事件系统等）
      // 将问题发送给用户界面，并等待用户响应
      // 目前返回问题结构，让调用方处理用户交互
      
      return {
        success: true,
        result: {
          type: 'followup_question',
          data: questionData,
          message: 'Follow-up question prepared for user interaction'
        },
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      getToolsLogger().error('Failed to ask follow-up question', error as Error, { 
        question: context.parameters.question 
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }
}