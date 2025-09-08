import { LeaderAgent, AgentInfo, TaskDelegationRequest, TaskDelegationResult } from '../../../src/core/agent/a2a/LeaderAgent';
import { TaskManager } from '../../../src/core/task/TaskManager';
import { Logger } from 'winston';
import type { Message, AgentCard } from '@a2a-js/sdk';

describe('LeaderAgent', () => {
  let leaderAgent: LeaderAgent;
  let mockLogger: Logger;
  let mockTaskManager: TaskManager;

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

    leaderAgent = new LeaderAgent(mockLogger, mockTaskManager);
  });

  describe('constructor', () => {
    it('should create LeaderAgent instance', () => {
      expect(leaderAgent).toBeDefined();
    });
  });

  describe('start and stop', () => {
    it('should start the leader agent successfully', async () => {
      // Mock the private methods
      jest.spyOn(leaderAgent as any, 'startAgentDiscovery').mockResolvedValue(undefined);
      jest.spyOn(leaderAgent as any, 'startHealthCheck').mockImplementation(() => {});
      
      await leaderAgent.start();
      
      expect(mockLogger.info).toHaveBeenCalledWith('Starting Leader Agent');
      expect(mockLogger.info).toHaveBeenCalledWith('Leader Agent started successfully');
    });

    it('should stop the leader agent successfully', async () => {
      // Mock the private methods
      jest.spyOn(leaderAgent as any, 'cancelAllDelegatedTasks').mockResolvedValue(undefined);
      
      await leaderAgent.stop();
      
      expect(mockLogger.info).toHaveBeenCalledWith('Stopping Leader Agent');
      expect(mockLogger.info).toHaveBeenCalledWith('Leader Agent stopped');
    });
  });

  describe('agent discovery', () => {
    it('should discover agents successfully', async () => {
      // Mock the private scanForAgents method
      jest.spyOn(leaderAgent as any, 'scanForAgents').mockResolvedValue(['http://localhost:3001']);
      
      const mockAgentCard: AgentCard = {
        name: 'Test Agent',
        version: '1.0.0',
        description: 'A test agent',
        url: 'http://localhost:3001',
        protocolVersion: '1.0',
        defaultInputModes: ['text/plain'],
        defaultOutputModes: ['text/plain'],
        capabilities: { extensions: [] },
        skills: [{
          id: 'test-skill',
          name: 'Test Skill',
          description: 'A test skill',
          tags: ['test']
        }],
        provider: {
          organization: 'Test Org',
          url: 'https://test.com'
        }
      };
      
      jest.spyOn(leaderAgent as any, 'fetchAgentCard').mockResolvedValue(mockAgentCard);
      jest.spyOn(leaderAgent as any, 'extractCapabilities').mockReturnValue(['test']);
      
      const agents = await leaderAgent.discoverAgents();
      
      expect(Array.isArray(agents)).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith('Discovering available agents');
    });

    it('should get discovered agents', () => {
      const agents = leaderAgent.getDiscoveredAgents();
      
      expect(Array.isArray(agents)).toBe(true);
    });

    it('should get agent info by id', () => {
      const agentInfo = leaderAgent.getAgentInfo('test-agent');
      
      expect(agentInfo).toBeUndefined(); // No agents registered yet
    });
  });

  describe('task delegation', () => {
    const mockMessage: Message = {
      kind: 'message',
      messageId: 'msg-1',
      role: 'user',
      parts: [{
        kind: 'text',
        text: 'test message'
      }]
    };

    it('should delegate task successfully', async () => {
      const mockAgent: AgentInfo = {
        id: 'test-agent',
        name: 'Test Agent',
        url: 'http://localhost:3001',
        capabilities: ['test'],
        skills: ['test-skill'],
        status: 'online',
        lastSeen: new Date(),
        agentCard: {} as AgentCard
      };

      // Mock finding suitable agent
      jest.spyOn(leaderAgent as any, 'findSuitableAgent').mockResolvedValue(mockAgent);
      
      // Mock sending task to agent
      jest.spyOn(leaderAgent as any, 'sendTaskToAgent').mockResolvedValue({
        success: true,
        result: 'Task completed successfully'
      });

      const result = await leaderAgent.delegateTask('task-1', 'test-skill', mockMessage);
      
      expect(result.success).toBe(true);
      expect(result.taskId).toBe('task-1');
    });

    it('should handle delegation when no suitable agent found', async () => {
      // Mock no suitable agent found
      jest.spyOn(leaderAgent as any, 'findSuitableAgent').mockResolvedValue(null);

      const result = await leaderAgent.delegateTask('task-1', 'non-existent-skill', mockMessage);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('No suitable agent found');
    });

    it('should get task result', () => {
      const taskResult = leaderAgent.getTaskResult('task-1');
      
      expect(taskResult).toBeUndefined(); // No tasks delegated yet
    });
  });

  describe('team coordination', () => {
    it('should get team status correctly', () => {
      const teamStatus = leaderAgent.getTeamStatus();
      
      expect(teamStatus).toBeDefined();
      expect(teamStatus.totalAgents).toBe(0);
      expect(teamStatus.onlineAgents).toBe(0);
      expect(teamStatus.busyAgents).toBe(0);
      expect(teamStatus.activeTasks).toBe(0);
      expect(Array.isArray(teamStatus.availableSkills)).toBe(true);
    });
  });

  describe('private methods', () => {
    it('should handle agent discovery errors gracefully', async () => {
      // Mock scanForAgents to throw error
      jest.spyOn(leaderAgent as any, 'scanForAgents').mockRejectedValue(new Error('Network error'));
      
      const agents = await leaderAgent.discoverAgents();
      
      expect(Array.isArray(agents)).toBe(true);
      expect(agents).toHaveLength(0);
    });

    it('should handle agent card fetch errors', async () => {
      jest.spyOn(leaderAgent as any, 'scanForAgents').mockResolvedValue(['http://localhost:3001']);
      jest.spyOn(leaderAgent as any, 'fetchAgentCard').mockRejectedValue(new Error('Fetch error'));
      
      const agents = await leaderAgent.discoverAgents();
      
      expect(Array.isArray(agents)).toBe(true);
    });
  });
});