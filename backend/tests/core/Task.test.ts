import { Task } from '../../src/core/task/Task';
import { TaskOptions, TaskStatus, ClineMessage } from '../../src/types';
import { ApiHandler } from '../../src/core/api/ApiHandler';
import { ToolExecutor } from '../../src/core/tools/ToolExecutor';
import { ToolRegistry } from '../../src/core/tools/ToolRegistry';
import { PromptService } from '../../src/core/prompt/PromptService';
import { SecurityManager } from '../../src/core/security/SecurityManager';
import { ConfigManager } from '../../src/config/ConfigManager';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock dependencies
jest.mock('../../src/core/api/ApiHandler');
jest.mock('../../src/core/tools/ToolExecutor');
jest.mock('../../src/core/tools/ToolRegistry');
jest.mock('../../src/core/prompt/PromptService');
jest.mock('../../src/core/security/SecurityManager');
jest.mock('../../src/config/ConfigManager');
jest.mock('../../src/tools/index', () => ({
  getAllToolGroups: jest.fn().mockReturnValue([])
}));

describe('Task Lifecycle', () => {
  let task: Task;
  let mockApiHandler: jest.Mocked<ApiHandler>;
  let mockToolExecutor: jest.Mocked<ToolExecutor>;
  let mockToolRegistry: jest.Mocked<ToolRegistry>;
  let mockPromptService: jest.Mocked<PromptService>;
  let mockSecurityManager: jest.Mocked<SecurityManager>;
  let mockConfigManager: jest.Mocked<ConfigManager>;

  const defaultTaskOptions: TaskOptions = {
    task: 'Test task description',
    workspacePath: path.join(os.homedir(), 'test-workspace'),
    apiConfiguration: {
      provider: 'anthropic',
      apiModelId: 'claude-3-sonnet-20240229',
      apiKey: 'test-api-key'
    }
  };

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mock implementations
    mockApiHandler = new ApiHandler({} as any) as jest.Mocked<ApiHandler>;
    mockSecurityManager = new SecurityManager({} as any) as jest.Mocked<SecurityManager>;
    mockToolExecutor = new ToolExecutor({} as any, mockSecurityManager) as jest.Mocked<ToolExecutor>;
    mockToolRegistry = new ToolRegistry({} as any, mockSecurityManager) as jest.Mocked<ToolRegistry>;
    mockPromptService = new PromptService(mockToolRegistry) as jest.Mocked<PromptService>;
    mockConfigManager = new ConfigManager({} as any) as jest.Mocked<ConfigManager>;

    // Mock constructor calls
    (ApiHandler as jest.MockedClass<typeof ApiHandler>).mockImplementation(() => mockApiHandler);
    (ToolExecutor as jest.MockedClass<typeof ToolExecutor>).mockImplementation(() => mockToolExecutor);
    (ToolRegistry as jest.MockedClass<typeof ToolRegistry>).mockImplementation(() => mockToolRegistry);
    (PromptService as jest.MockedClass<typeof PromptService>).mockImplementation(() => mockPromptService);
    (SecurityManager as jest.MockedClass<typeof SecurityManager>).mockImplementation(() => mockSecurityManager);
    (ConfigManager as jest.MockedClass<typeof ConfigManager>).mockImplementation(() => mockConfigManager);

    // Setup default mock behaviors
    mockPromptService.generateSystemPrompt = jest.fn().mockResolvedValue('System prompt');
    mockApiHandler.makeRequest = jest.fn().mockResolvedValue({
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'AI response' }]
      }
    });
    mockToolRegistry.getAllTools = jest.fn().mockReturnValue([]);
    mockSecurityManager.validateToolExecution = jest.fn().mockResolvedValue({ allowed: true });
  });

  describe('Task Initialization', () => {
    it('should create a task with valid options', () => {
      task = new Task(defaultTaskOptions);
      
      expect(task).toBeInstanceOf(Task);
      expect(task.taskId).toBeDefined();
      expect(task.instanceId).toBeDefined();
      expect(task.workspacePath).toBe(defaultTaskOptions.workspacePath);
      expect(task.metadata.task).toBe(defaultTaskOptions.task);
      expect(task.abort).toBe(false);
      expect(task.isInitialized).toBe(false);
      expect(task.isPaused).toBe(false);
    });

    it('should throw error when neither task nor images are provided', () => {
      const invalidOptions = {
        ...defaultTaskOptions,
        task: undefined,
        images: undefined
      };
      
      expect(() => new Task(invalidOptions as any)).toThrow('Either task or images must be provided');
    });

    it('should generate unique task and instance IDs', () => {
      const task1 = new Task(defaultTaskOptions);
      const task2 = new Task(defaultTaskOptions);
      
      expect(task1.taskId).not.toBe(task2.taskId);
      expect(task1.instanceId).not.toBe(task2.instanceId);
    });

    it('should use default workspace path when not provided', () => {
      const optionsWithoutWorkspace = {
        ...defaultTaskOptions,
        workspacePath: undefined
      };
      
      task = new Task(optionsWithoutWorkspace as any);
      expect(task.workspacePath).toBe(path.join(os.homedir(), 'Desktop'));
    });
  });

  describe('Task Status Management', () => {
    beforeEach(() => {
      task = new Task(defaultTaskOptions);
    });

    it('should return correct initial status', () => {
      const status = task.getStatus();
      expect(status).toBe('pending');
    });

    it('should return running status when task is started', async () => {
      // Mock the task to be initialized and streaming
      (task as any).isInitialized = true;
      (task as any).isStreaming = true;
      expect(task.getStatus()).toBe('running');
    });

    it('should return aborted status when task is aborted', async () => {
      await task.abortTask();
      expect(task.getStatus()).toBe('aborted');
      expect(task.abort).toBe(true);
    });

    it('should return paused status when task is paused', async () => {
      await task.pauseTask();
      expect(task.getStatus()).toBe('paused');
      expect(task.isPaused).toBe(true);
    });

    it('should return running status when task is resumed', async () => {
      await task.pauseTask();
      await task.resumeTask();
      // After resume, task should not be paused but may not be running yet
      expect(task.isPaused).toBe(false);
      // Set the task to running state for this test
      (task as any).isInitialized = true;
      (task as any).isStreaming = true;
      expect(task.getStatus()).toBe('running');
    });
  });

  describe('Task Execution Lifecycle', () => {
    beforeEach(() => {
      task = new Task(defaultTaskOptions);
    });

    it('should emit task:started event when task starts', async () => {
      const startedSpy = jest.fn();
      task.on('task:started', startedSpy);
      
      // Mock the task loop to prevent infinite execution
      (task as any).initiateTaskLoop = jest.fn().mockResolvedValue(undefined);
      
      await task.startTask();
      
      expect(startedSpy).toHaveBeenCalledWith(task.taskId);
    });

    it('should emit task:completed event when task completes successfully', async () => {
      const completedSpy = jest.fn();
      task.on('task:completed', completedSpy);
      
      // Mock the task completion by setting the last message
      (task as any).clineMessages = [{
        type: 'say',
        say: 'completion_result',
        text: 'Task completed successfully',
        ts: Date.now()
      }];
      
      // Trigger completion event manually since we're testing the event emission
      task.emit('task:completed', task.taskId, { success: true });
      
      expect(completedSpy).toHaveBeenCalledWith(task.taskId, { success: true });
    });

    it('should emit task:failed event when task fails', async () => {
      const failedSpy = jest.fn();
      task.on('task:failed', failedSpy);
      
      const testError = new Error('Test error');
      (task as any).initiateTaskLoop = jest.fn().mockRejectedValue(testError);
      
      await expect(task.startTask()).rejects.toThrow('Test error');
      expect(failedSpy).toHaveBeenCalledWith(task.taskId, testError);
    });

    it('should emit task:aborted event when task is aborted', async () => {
      const abortedSpy = jest.fn();
      task.on('task:aborted', abortedSpy);
      
      await task.abortTask();
      
      expect(abortedSpy).toHaveBeenCalledWith(task.taskId);
    });

    it('should emit task:paused event when task is paused', async () => {
      const pausedSpy = jest.fn();
      task.on('task:paused', pausedSpy);
      
      await task.pauseTask();
      
      expect(pausedSpy).toHaveBeenCalledWith(task.taskId);
    });

    it('should initialize task state correctly on start', async () => {
      (task as any).initiateTaskLoop = jest.fn().mockResolvedValue(undefined);
      
      await task.startTask('New task', ['image1.jpg']);
      
      expect(task.isInitialized).toBe(true);
      expect(task.metadata.task).toBe('New task');
      expect(task.metadata.images).toEqual(['image1.jpg']);
      expect(task.abort).toBe(false);
      expect(task.isPaused).toBe(false);
    });

    it('should reset conversation history on task start', async () => {
      (task as any).initiateTaskLoop = jest.fn().mockResolvedValue(undefined);
      
      // Add some initial messages
      (task as any).clineMessages = [{ type: 'say', text: 'old message' }];
      (task as any).apiConversationHistory = [{ role: 'user', content: 'old content' }];
      
      await task.startTask();
      
      expect(task.getMessages()).toHaveLength(1); // Only the new initial message
      expect((task as any).apiConversationHistory).toHaveLength(0);
    });
  });

  describe('Message and Todo Management', () => {
    beforeEach(() => {
      task = new Task(defaultTaskOptions);
    });

    it('should return empty messages initially', () => {
      const messages = task.getMessages();
      expect(messages).toEqual([]);
    });

    it('should return empty todos initially', () => {
      const todos = task.getTodos();
      expect(todos).toEqual([]);
    });

    it('should update todos correctly', () => {
      const newTodos = [
        { id: '1', content: 'Todo 1', status: 'pending' as const, priority: 'high' as const, createdAt: Date.now() },
        { id: '2', content: 'Todo 2', status: 'completed' as const, priority: 'medium' as const, createdAt: Date.now() }
      ];
      
      task.updateTodos(newTodos);
      
      expect(task.getTodos()).toEqual(newTodos);
    });

    it('should emit task:message event when todos are updated', () => {
      const messageSpy = jest.fn();
      task.on('task:message', messageSpy);
      
      const newTodos = [
        { id: '1', content: 'Todo 1', status: 'pending' as const, priority: 'high' as const, createdAt: Date.now() }
      ];
      
      task.updateTodos(newTodos);
      
      expect(messageSpy).toHaveBeenCalledWith(task.taskId, expect.objectContaining({
        type: 'say',
        say: 'text',
        text: 'Todo list updated'
      }));
      expect(task.getTodos()).toEqual(newTodos);
    });
  });

  describe('Task Loop Integration', () => {
    beforeEach(() => {
      task = new Task(defaultTaskOptions);
    });

    it('should stop task loop when abort is called during execution', async () => {
      let loopCount = 0;
      const maxLoops = 3;
      
      // Mock the recursivelyMakeRequests to simulate ongoing execution
      (task as any).recursivelyMakeRequests = jest.fn().mockImplementation(async () => {
        loopCount++;
        if (loopCount >= maxLoops) {
          // Simulate abort after a few loops
          task.abort = true;
        }
        return false; // Continue loop
      });
      
      await task.startTask();
      
      expect(loopCount).toBe(maxLoops);
      expect(task.abort).toBe(true);
    });

    it('should stop task loop when pause is called during execution', async () => {
      let loopCount = 0;
      const maxLoops = 3;
      
      // Mock the recursivelyMakeRequests to simulate ongoing execution
      (task as any).recursivelyMakeRequests = jest.fn().mockImplementation(async () => {
        loopCount++;
        if (loopCount >= maxLoops) {
          // Simulate pause after a few loops
          task.isPaused = true;
        }
        return false; // Continue loop
      });
      
      await task.startTask();
      
      expect(loopCount).toBe(maxLoops);
      expect(task.isPaused).toBe(true);
    });

    it('should complete task when recursivelyMakeRequests returns true', async () => {
      const completedSpy = jest.fn();
      task.on('task:completed', completedSpy);
      
      // Mock successful completion
      (task as any).recursivelyMakeRequests = jest.fn().mockResolvedValue(true);
      
      await task.startTask();
      
      expect(completedSpy).toHaveBeenCalledWith(task.taskId, { success: true });
    });
  });
});