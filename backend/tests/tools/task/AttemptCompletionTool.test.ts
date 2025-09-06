import { AttemptCompletionTool } from '../../../src/tools/task/AttemptCompletionTool';
import { ToolExecutionContext } from '../../../src/types';

describe('AttemptCompletionTool', () => {
  let tool: AttemptCompletionTool;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    tool = new AttemptCompletionTool();
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
      expect(tool.name).toBe('attempt_completion');
    });

    it('should have correct description', () => {
      expect(tool.description).toBe('Present the result of the task to the user after confirming all previous tool uses were successful');
    });

    it('should have correct parameters schema', () => {
      expect(tool.parameters).toEqual({
        type: 'object',
        properties: {
          result: {
            type: 'string',
            description: 'The final result of the task. Should be formulated in a way that is final and does not require further input from the user.'
          }
        },
        required: ['result']
      });
    });
  });

  describe('execute', () => {
    it('should complete task successfully with all parameters', async () => {
      const result = 'Task completed successfully';
      const confidence = 0.9;
      const summary = 'All objectives were met';
      
      mockContext.parameters = { result, confidence, summary };

      const response = await tool.execute(mockContext);

      expect(response.success).toBe(true);
      expect(response.result).toEqual({
        type: 'task_completion',
        result,
        timestamp: expect.any(String),
        session_id: expect.any(String),
        message: 'Task has been completed successfully'
      });
      expect(response.error).toBeUndefined();
    });

    it('should complete task with default confidence', async () => {
      const result = 'Task completed';
      
      mockContext.parameters = { result };

      const response = await tool.execute(mockContext);

      expect(response.success).toBe(true);
      expect(response.result?.type).toBe('task_completion');
    });

    it('should complete task without summary', async () => {
      const result = 'Task completed';
      const confidence = 0.7;
      
      mockContext.parameters = { result, confidence };

      const response = await tool.execute(mockContext);

      expect(response.success).toBe(true);
      expect(response.result).toEqual({
        type: 'task_completion',
        result,
        timestamp: expect.any(String),
        session_id: expect.any(String),
        message: 'Task has been completed successfully'
      });
    });

    it('should handle missing result parameter', async () => {
      mockContext.parameters = {};

      const response = await tool.execute(mockContext);

      expect(response.success).toBe(true);
      expect(response.result?.type).toBe('task_completion');
    });

    it('should handle empty result', async () => {
      mockContext.parameters = { result: '' };

      const response = await tool.execute(mockContext);

      expect(response.success).toBe(true);
      expect(response.result?.type).toBe('task_completion');
    });

    it('should handle invalid confidence value (too low)', async () => {
      mockContext.parameters = {
        result: 'Task completed',
        confidence: -0.1
      };

      const response = await tool.execute(mockContext);

      expect(response.success).toBe(true);
      expect(response.result?.type).toBe('task_completion');
    });

    it('should handle invalid confidence value (too high)', async () => {
      mockContext.parameters = {
        result: 'Task completed',
        confidence: 1.5
      };

      const response = await tool.execute(mockContext);

      expect(response.success).toBe(true);
      expect(response.result?.type).toBe('task_completion');
    });

    it('should handle boundary confidence values', async () => {
      // Test confidence = 0
      mockContext.parameters = {
        result: 'Task completed',
        confidence: 0
      };

      let response = await tool.execute(mockContext);
      expect(response.success).toBe(true);
      expect(response.result?.type).toBe('task_completion');

      // Test confidence = 1
      mockContext.parameters = {
        result: 'Task completed',
        confidence: 1
      };

      response = await tool.execute(mockContext);
      expect(response.success).toBe(true);
      expect(response.result?.type).toBe('task_completion');
    });

    it('should include timestamp in completion data', async () => {
      const beforeTime = Date.now();
      
      mockContext.parameters = { result: 'Task completed' };
      const response = await tool.execute(mockContext);
      
      const afterTime = Date.now();

      expect(response.success).toBe(true);
      expect(response.result?.timestamp).toBeDefined();
      const completedAtTime = new Date(response.result?.timestamp).getTime();
      expect(completedAtTime).toBeGreaterThanOrEqual(beforeTime);
      expect(completedAtTime).toBeLessThanOrEqual(afterTime);
    });

    it('should handle very long result text', async () => {
      const longResult = 'A'.repeat(10000);
      
      mockContext.parameters = { result: longResult };
      const response = await tool.execute(mockContext);

      expect(response.success).toBe(true);
      expect(response.result?.result).toBe(longResult);
    });

    it('should handle special characters in result', async () => {
      const specialResult = 'Task completed with 100% success! 🎉 "Great job" & more...';
      
      mockContext.parameters = { result: specialResult };
      const response = await tool.execute(mockContext);

      expect(response.success).toBe(true);
      expect(response.result?.result).toBe(specialResult);
    });

    it('should include execution time in response', async () => {
      mockContext.parameters = { result: 'Task completed' };
      
      const response = await tool.execute(mockContext);

      expect(response.success).toBe(true);
      expect(typeof response.executionTime).toBe('number');
      expect(response.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle non-string confidence parameter', async () => {
      mockContext.parameters = {
        result: 'Task completed',
        confidence: '0.8' as any
      };

      const response = await tool.execute(mockContext);

      expect(response.success).toBe(true);
      expect(response.result?.type).toBe('task_completion');
    });
  });
});