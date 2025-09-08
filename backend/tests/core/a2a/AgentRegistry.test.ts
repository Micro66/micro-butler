import { AgentRegistry, AgentConfig, AgentInstance } from '../../../src/core/agent/a2a/AgentRegistry';
import { WorkerAgent, WorkerAgentConfig } from '../../../src/core/agent/a2a/WorkerAgent';
import { AgentDiscovery } from '../../../src/core/agent/a2a/AgentDiscovery';
import { TaskManager } from '../../../src/core/task/TaskManager';
import { Logger } from 'winston';

// Mock WorkerAgent for testing
class MockWorkerAgent extends WorkerAgent {
  constructor(logger: Logger, taskManager: TaskManager, config: WorkerAgentConfig) {
    super(logger, taskManager, config);
  }

  protected async initializeSkills(): Promise<void> {
    // Mock implementation
  }
}

describe('AgentRegistry', () => {
  let registry: AgentRegistry;
  let mockDiscovery: AgentDiscovery;
  let mockLogger: Logger;
  let mockTaskManager: TaskManager;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;
    
    mockTaskManager = {
      createTask: jest.fn(),
      getTask: jest.fn(),
      updateTask: jest.fn()
    } as any;
    
    mockDiscovery = {
      registerAgent: jest.fn(),
      unregisterAgent: jest.fn(),
      discoverAgents: jest.fn(),
      getAgentCard: jest.fn()
    } as any;
    
    registry = new AgentRegistry(mockDiscovery);
  });

  afterEach(async () => {
    await registry.shutdown();
  });

  describe('registerAgent', () => {
    it('should register a new agent successfully', async () => {
      const config: AgentConfig = {
        id: 'test-agent',
        type: 'worker',
        name: 'Test Agent',
        capabilities: ['test'],
        autoStart: false
      };

      const agentConfig: WorkerAgentConfig = {
        agentId: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        version: '1.0.0',
        url: 'http://localhost:3000'
      };

      const agent = new MockWorkerAgent(mockLogger, mockTaskManager, agentConfig);
      
      await registry.registerAgent(agent, config);
      const retrievedAgent = registry.getAgent('test-agent');
      expect(retrievedAgent).toBeDefined();
      expect(retrievedAgent?.id).toBe('test-agent');
    });

    it('should throw error when registering agent with duplicate ID', async () => {
      const config: AgentConfig = {
        id: 'test-agent',
        type: 'worker',
        name: 'Test Agent',
        capabilities: ['test']
      };

      const agentConfig: WorkerAgentConfig = {
        agentId: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        version: '1.0.0',
        url: 'http://localhost:3000'
      };

      const agent1 = new MockWorkerAgent(mockLogger, mockTaskManager, agentConfig);
      const agent2 = new MockWorkerAgent(mockLogger, mockTaskManager, agentConfig);
      
      await registry.registerAgent(agent1, config);
      await expect(registry.registerAgent(agent2, config)).rejects.toThrow();
    });
  });

  describe('startAgent', () => {
    it('should start a registered agent', async () => {
      const config: AgentConfig = {
        id: 'test-agent',
        type: 'worker',
        name: 'Test Agent',
        capabilities: ['test']
      };

      const agentConfig: WorkerAgentConfig = {
        agentId: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        version: '1.0.0',
        url: 'http://localhost:3000'
      };

      const agent = new MockWorkerAgent(mockLogger, mockTaskManager, agentConfig);
      await registry.registerAgent(agent, config);
      await registry.startAgent('test-agent');

      const instance = registry.getAgent('test-agent');
      expect(instance?.status).toBe('running');
      expect(instance?.startedAt).toBeDefined();
    });

    it('should throw error when starting non-existent agent', async () => {
      await expect(registry.startAgent('non-existent')).rejects.toThrow();
    });
  });

  describe('stopAgent', () => {
    it('should stop a running agent', async () => {
      const config: AgentConfig = {
        id: 'test-agent',
        type: 'worker',
        name: 'Test Agent',
        capabilities: ['test']
      };

      const agentConfig: WorkerAgentConfig = {
        agentId: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        version: '1.0.0',
        url: 'http://localhost:3000'
      };

      const agent = new MockWorkerAgent(mockLogger, mockTaskManager, agentConfig);
      await registry.registerAgent(agent, config);
      await registry.startAgent('test-agent');
      await registry.stopAgent('test-agent');

      const instance = registry.getAgent('test-agent');
      expect(instance?.status).toBe('stopped');
    });
  });

  describe('getStatistics', () => {
    it('should return correct statistics', async () => {
      const config1: AgentConfig = {
        id: 'agent-1',
        type: 'worker',
        name: 'Agent 1',
        capabilities: ['test']
      };

      const config2: AgentConfig = {
        id: 'agent-2',
        type: 'leader',
        name: 'Agent 2',
        capabilities: ['test']
      };

      const agentConfig1: WorkerAgentConfig = {
        agentId: 'agent-1',
        name: 'Agent 1',
        description: 'First agent',
        version: '1.0.0',
        url: 'http://localhost:3001'
      };

      const agentConfig2: WorkerAgentConfig = {
        agentId: 'agent-2',
        name: 'Agent 2',
        description: 'Second agent',
        version: '1.0.0',
        url: 'http://localhost:3002'
      };

      const agent1 = new MockWorkerAgent(mockLogger, mockTaskManager, agentConfig1);
      const agent2 = new MockWorkerAgent(mockLogger, mockTaskManager, agentConfig2);
      
      await registry.registerAgent(agent1, config1);
      await registry.registerAgent(agent2, config2);

      const stats = registry.getStatistics();
      expect(stats.totalAgents).toBe(2);
      expect(stats.stoppedAgents).toBe(2);
      expect(stats.runningAgents).toBe(0);
      expect(stats.errorAgents).toBe(0);
    });
  });

  describe('getAllAgents', () => {
    it('should return all registered agents', async () => {
      const config: AgentConfig = {
        id: 'test-agent',
        type: 'worker',
        name: 'Test Agent',
        capabilities: ['test']
      };

      const agentConfig: WorkerAgentConfig = {
        agentId: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        version: '1.0.0',
        url: 'http://localhost:3000'
      };

      const agent = new MockWorkerAgent(mockLogger, mockTaskManager, agentConfig);
      await registry.registerAgent(agent, config);
      
      const agents = registry.getAllAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0]?.id).toBe('test-agent');
      expect(agents[0]?.config.type).toBe('worker');
    });
  });
});