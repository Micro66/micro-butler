import { WorkerAgent, Skill, SkillContext, SkillResult, WorkerAgentConfig } from '../../../src/core/agent/a2a/WorkerAgent';
import { TaskManager } from '../../../src/core/task/TaskManager';
import { Logger } from 'winston';
import type { Message } from '@a2a-js/sdk';

// Mock WorkerAgent implementation for testing
class TestWorkerAgent extends WorkerAgent {
  constructor(logger: Logger, taskManager: TaskManager, config: WorkerAgentConfig) {
    super(logger, taskManager, config);
  }

  protected async initializeSkills(): Promise<void> {
    // Register test skills
    const testSkill: Skill = {
      id: 'test-skill',
      name: 'Test Skill',
      description: 'A test skill for unit testing',
      tags: ['test'],
      inputModes: ['text'],
      outputModes: ['text'],
      execute: async (message: Message, context: SkillContext): Promise<SkillResult> => {
        const firstPart = message.parts?.[0];
        const text = firstPart?.kind === 'text' ? firstPart.text : 'empty message';
        return {
          success: true,
          result: `Processed: ${text}`,
          metadata: { processed: true }
        };
      }
    };

    this.registerSkill(testSkill);
  }
}

describe('WorkerAgent', () => {
  let workerAgent: TestWorkerAgent;
  let mockLogger: Logger;
  let mockTaskManager: TaskManager;
  let config: WorkerAgentConfig;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis()
    } as any;

    mockTaskManager = {
      createTask: jest.fn(),
      getTask: jest.fn(),
      updateTask: jest.fn(),
      completeTask: jest.fn()
    } as any;

    config = {
      agentId: 'test-worker',
      name: 'Test Worker Agent',
      description: 'A test worker agent',
      version: '1.0.0',
      url: 'http://localhost:3000',
      maxConcurrentTasks: 5,
      healthCheckInterval: 30000
    };

    workerAgent = new TestWorkerAgent(mockLogger, mockTaskManager, config);
  });

  afterEach(async () => {
    if (workerAgent.getStatus().isRunning) {
      await workerAgent.stop();
    }
  });

  describe('constructor', () => {
    it('should create WorkerAgent instance with correct configuration', () => {
      expect(workerAgent).toBeDefined();
      expect(workerAgent.getStatus().isRunning).toBe(false);
      expect(workerAgent.getStatus().activeTaskCount).toBe(0);
    });
  });

  describe('start', () => {
    it('should start the worker agent successfully', async () => {
      await workerAgent.start();
      
      expect(workerAgent.getStatus().isRunning).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Starting WorkerAgent: test-worker');
    });

    it('should initialize skills when starting', async () => {
      await workerAgent.start();
      
      const skills = workerAgent.getRegisteredSkills();
      expect(skills).toHaveLength(1);
      expect(skills[0]?.id).toBe('test-skill');
    });

    it('should warn if already running', async () => {
      const loggerWarnSpy = jest.spyOn(mockLogger, 'warn');
      await workerAgent.start();
      await workerAgent.start();
      
      expect(loggerWarnSpy).toHaveBeenCalledWith('Worker agent is already running', { agentId: 'test-worker' });
    });
  });

  describe('stop', () => {
    it('should stop the worker agent successfully', async () => {
      await workerAgent.start();
      await workerAgent.stop();
      
      expect(workerAgent.getStatus().isRunning).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Worker agent stopped', { agentId: 'test-worker' });
    });

    it('should not log when stopping if not running', async () => {
      const loggerInfoSpy = jest.spyOn(mockLogger, 'info');
      await workerAgent.stop();
      
      // Should not log anything when stopping a non-running agent
      expect(loggerInfoSpy).not.toHaveBeenCalled();
    });
  });

  describe('skill management', () => {
    beforeEach(async () => {
      await workerAgent.start();
    });

    it('should register skills correctly', () => {
      const newSkill: Skill = {
        id: 'new-skill',
        name: 'New Skill',
        description: 'A new test skill',
        tags: ['new'],
        inputModes: ['text'],
        outputModes: ['text'],
        execute: async () => ({ success: true })
      };

      workerAgent.registerSkill(newSkill);
      
      const skills = workerAgent.getRegisteredSkills();
      expect(skills).toHaveLength(2);
      expect(skills.find(s => s.id === 'new-skill')).toBeDefined();
    });

    it('should unregister skills correctly', () => {
      const result = workerAgent.unregisterSkill('test-skill');
      
      expect(result).toBe(true);
      expect(workerAgent.getRegisteredSkills()).toHaveLength(0);
    });

    it('should return false when unregistering non-existent skill', () => {
      const result = workerAgent.unregisterSkill('non-existent');
      
      expect(result).toBe(false);
    });
  });

  describe('skill execution', () => {
    beforeEach(async () => {
      await workerAgent.start();
    });

    it('should execute skill successfully', async () => {
      const message: Message = {
        kind: 'message',
        messageId: 'msg-1',
        role: 'user',
        parts: [{
          kind: 'text',
          text: 'test message'
        }]
      };

      const context: Partial<SkillContext> = {
        taskId: 'task-1',
        agentId: 'test-worker'
      };

      const result = await workerAgent.executeSkill('test-skill', message, context);
      
      expect(result.success).toBe(true);
      expect(result.result).toBe('Processed: test message');
      expect(result.metadata?.processed).toBe(true);
    });

    it('should handle skill execution errors', async () => {
      const message: Message = {
        kind: 'message',
        messageId: 'msg-1',
        role: 'user',
        parts: [{
          kind: 'text',
          text: 'test message'
        }]
      };

      const result = await workerAgent.executeSkill('non-existent-skill', message);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Skill not found');
    });
  });

  describe('getAgentCard', () => {
    beforeEach(async () => {
      await workerAgent.start();
    });

    it('should return correct agent card', () => {
      const agentCard = workerAgent.getAgentCard();
      
      expect(agentCard.name).toBe('Test Worker Agent');
      expect(agentCard.description).toBe('A test worker agent');
      expect(agentCard.version).toBe('1.0.0');
      expect(agentCard.url).toBe('http://localhost:3000');
      expect(agentCard.skills).toHaveLength(1);
      expect(agentCard.skills[0]?.id).toBe('test-skill');
    });
  });

  describe('getStatus', () => {
    it('should return correct status when stopped', () => {
      const status = workerAgent.getStatus();
      
      expect(status.isRunning).toBe(false);
      expect(status.activeTaskCount).toBe(0);
      expect(status.registeredSkills).toHaveLength(0);
    });

    it('should return correct status when running', async () => {
      await workerAgent.start();
      const status = workerAgent.getStatus();
      
      expect(status.isRunning).toBe(true);
      expect(status.activeTaskCount).toBe(0);
      expect(status.registeredSkills).toHaveLength(1);
    });
  });

  describe('canAcceptTask', () => {
    beforeEach(async () => {
      await workerAgent.start();
    });

    it('should return true when agent can accept tasks', () => {
      expect(workerAgent.canAcceptTask()).toBe(true);
    });

    it('should return false when agent is not running', async () => {
      await workerAgent.stop();
      expect(workerAgent.canAcceptTask()).toBe(false);
    });
  });

  describe('getAgentExecutor', () => {
    it('should return the agent executor', () => {
      const executor = workerAgent.getAgentExecutor();
      expect(executor).toBeDefined();
    });
  });
});