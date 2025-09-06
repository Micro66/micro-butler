import { AskFollowupQuestionTool } from '../../../src/tools/interaction/AskFollowupQuestionTool';
import { ToolExecutionContext } from '../../../src/types';

describe('AskFollowupQuestionTool', () => {
  let tool: AskFollowupQuestionTool;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    tool = new AskFollowupQuestionTool();
    mockContext = {
      parameters: {},
      workspacePath: '/test/workspace',
      taskId: 'test-task-id',
      security: {},
      securityManager: undefined
    };
    jest.clearAllMocks();
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('ask_followup_question');
    });

    it('should have correct description', () => {
      expect(tool.description).toBe('Ask the user a follow-up question to gather more information');
    });

    it('should have correct parameters schema', () => {
      expect(tool.parameters).toEqual({
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
      });
    });
  });

  describe('execute', () => {
    it('should return question for user interaction', async () => {
      const question = 'What is your name?';
      mockContext.parameters = { question };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        type: 'followup_question',
        data: {
          question,
          context: '',
          options: [],
          timestamp: expect.any(String),
          session_id: expect.any(String)
        },
        message: 'Follow-up question prepared for user interaction'
      });
      expect(result.error).toBeUndefined();
    });

    it('should use custom context', async () => {
      const question = 'Choose an option:';
      const context = 'Please select from the available options';
      mockContext.parameters = { question, context };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        type: 'followup_question',
        data: {
          question,
          context: 'Please select from the available options',
          options: [],
          timestamp: expect.any(String),
          session_id: expect.any(String)
        },
        message: 'Follow-up question prepared for user interaction'
      });
    });

    it('should handle missing question parameter', async () => {
      mockContext.parameters = {};

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result?.type).toBe('followup_question');
    });

    it('should handle empty question', async () => {
      mockContext.parameters = { question: '' };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result?.type).toBe('followup_question');
    });

    it('should handle invalid timeout', async () => {
      mockContext.parameters = {
        question: 'Test question?',
        timeout: -1000
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result?.type).toBe('followup_question');
    });

    it('should handle very long questions', async () => {
      const longQuestion = 'A'.repeat(10000);
      mockContext.parameters = { question: longQuestion };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result?.data?.question).toBe(longQuestion);
    });

    it('should handle questions with special characters', async () => {
      const specialQuestion = 'What\'s your favorite "programming" language? 🚀';
      mockContext.parameters = { question: specialQuestion };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result?.data?.question).toBe(specialQuestion);
    });

    it('should include execution time in result', async () => {
      mockContext.parameters = { question: 'Test?' };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(typeof result.executionTime).toBe('number');
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });
  });
});