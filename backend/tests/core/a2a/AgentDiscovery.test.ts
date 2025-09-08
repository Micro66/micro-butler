import { AgentDiscovery, AgentRegistration } from '../../../src/core/agent/a2a/AgentDiscovery';
import type { AgentCard } from '@a2a-js/sdk';

describe('AgentDiscovery', () => {
  let agentDiscovery: AgentDiscovery;

  beforeEach(() => {
    agentDiscovery = new AgentDiscovery();
  });

  afterEach(async () => {
    await agentDiscovery.stop();
  });

  describe('constructor', () => {
    it('should create AgentDiscovery instance', () => {
      expect(agentDiscovery).toBeDefined();
    });
  });

  describe('agent registration', () => {
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

    const mockRegistration: Omit<AgentRegistration, 'lastSeen'> = {
      id: 'test-agent',
      card: mockAgentCard,
      endpoint: 'http://localhost:3001',
      status: 'online',
      capabilities: ['test'],
      load: 0
    };

    it('should register agent successfully', async () => {
      await agentDiscovery.registerAgent(mockRegistration);
      
      const agent = await agentDiscovery.getAgent('test-agent');
      expect(agent).toBeDefined();
      expect(agent?.id).toBe('test-agent');
      expect(agent?.card.name).toBe('Test Agent');
    });

    it('should unregister agent successfully', async () => {
      await agentDiscovery.registerAgent(mockRegistration);
      await agentDiscovery.unregisterAgent('test-agent');
      
      const agent = await agentDiscovery.getAgent('test-agent');
      expect(agent).toBeNull();
    });

    it('should handle unregistering non-existent agent', async () => {
      await agentDiscovery.unregisterAgent('non-existent');
      
      // Should not throw error
      expect(true).toBe(true);
    });
  });

  describe('agent discovery', () => {
    const mockAgentCard1: AgentCard = {
      name: 'Test Agent 1',
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

    const mockAgentCard2: AgentCard = {
      name: 'Test Agent 2',
      version: '1.0.0',
      description: 'Another test agent',
      url: 'http://localhost:3002',
      protocolVersion: '1.0',
      defaultInputModes: ['text/plain'],
      defaultOutputModes: ['text/plain'],
      capabilities: { extensions: [] },
      skills: [{
        id: 'another-skill',
        name: 'Another Skill',
        description: 'Another test skill',
        tags: ['another']
      }],
      provider: {
        organization: 'Test Org',
        url: 'https://test.com'
      }
    };

    beforeEach(async () => {
      await agentDiscovery.registerAgent({
        id: 'test-agent-1',
        card: mockAgentCard1,
        endpoint: 'http://localhost:3001',
        status: 'online',
        capabilities: ['test'],
        load: 20
      });
      
      await agentDiscovery.registerAgent({
        id: 'test-agent-2',
        card: mockAgentCard2,
        endpoint: 'http://localhost:3002',
        status: 'online',
        capabilities: ['another'],
        load: 50
      });
    });

    it('should get all registered agents', async () => {
      const agents = await agentDiscovery.getAllAgents();
      
      expect(agents).toHaveLength(2);
      expect(agents.map(a => a.id)).toContain('test-agent-1');
      expect(agents.map(a => a.id)).toContain('test-agent-2');
    });

    it('should discover agents with capability filter', async () => {
      const result = await agentDiscovery.discoverAgents({ capabilities: ['test'] });
      
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0]?.id).toBe('test-agent-1');
      expect(result.totalFound).toBe(1);
    });

    it('should discover agents with load filter', async () => {
      const result = await agentDiscovery.discoverAgents({ maxLoad: 30 });
      
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0]?.id).toBe('test-agent-1');
      expect(result.totalFound).toBe(1);
    });

    it('should exclude specified agents', async () => {
      const result = await agentDiscovery.discoverAgents({ excludeIds: ['test-agent-1'] });
      
      expect(result.agents).toHaveLength(1);
      expect(result.agents[0]?.id).toBe('test-agent-2');
      expect(result.totalFound).toBe(1);
    });

    it('should get agent by id', async () => {
      const agent = await agentDiscovery.getAgent('test-agent-1');
      
      expect(agent).toBeDefined();
      expect(agent?.id).toBe('test-agent-1');
    });

    it('should return null for non-existent agent', async () => {
      const agent = await agentDiscovery.getAgent('non-existent');
      
      expect(agent).toBeNull();
    });

    it('should find best agent for capability', async () => {
      const agent = await agentDiscovery.findBestAgent('test');
      
      expect(agent).toBeDefined();
      expect(agent?.id).toBe('test-agent-1');
    });

    it('should return null when no agent has required capability', async () => {
      const agent = await agentDiscovery.findBestAgent('non-existent-capability');
      
      expect(agent).toBeNull();
    });
  });

  describe('agent status management', () => {
    const mockRegistration: Omit<AgentRegistration, 'lastSeen'> = {
      id: 'test-agent',
      card: {} as AgentCard,
      endpoint: 'http://localhost:3001',
      status: 'online',
      capabilities: ['test'],
      load: 0
    };

    beforeEach(async () => {
      await agentDiscovery.registerAgent(mockRegistration);
    });

    it('should update agent heartbeat with status', async () => {
      await agentDiscovery.updateAgentHeartbeat('test-agent', 'busy', 75);
      
      const agent = await agentDiscovery.getAgent('test-agent');
      expect(agent?.status).toBe('busy');
      expect(agent?.load).toBe(75);
    });

    it('should update agent heartbeat without status change', async () => {
      const beforeUpdate = new Date();
      await agentDiscovery.updateAgentHeartbeat('test-agent');
      
      const agent = await agentDiscovery.getAgent('test-agent');
      expect(agent?.lastSeen.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });

    it('should handle heartbeat update for non-existent agent', async () => {
      await agentDiscovery.updateAgentHeartbeat('non-existent', 'busy');
      
      // Should not throw error
      expect(true).toBe(true);
    });

    it('should clamp load values to valid range', async () => {
      await agentDiscovery.updateAgentHeartbeat('test-agent', 'busy', 150);
      
      const agent = await agentDiscovery.getAgent('test-agent');
      expect(agent?.load).toBe(100);
      
      await agentDiscovery.updateAgentHeartbeat('test-agent', 'busy', -10);
      
      const updatedAgent = await agentDiscovery.getAgent('test-agent');
      expect(updatedAgent?.load).toBe(0);
    });
  });

  describe('statistics', () => {
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

    beforeEach(async () => {
      await agentDiscovery.registerAgent({
        id: 'test-agent-1',
        card: mockAgentCard,
        endpoint: 'http://localhost:3001',
        status: 'online',
        capabilities: ['test'],
        load: 25
      });
      
      await agentDiscovery.registerAgent({
        id: 'test-agent-2',
        card: mockAgentCard,
        endpoint: 'http://localhost:3002',
        status: 'busy',
        capabilities: ['test'],
        load: 75
      });
    });

    it('should get discovery statistics', async () => {
      const stats = await agentDiscovery.getStatistics();
      
      expect(stats).toBeDefined();
      expect(stats.totalAgents).toBe(2);
      expect(stats.onlineAgents).toBe(1);
      expect(stats.busyAgents).toBe(1);
      expect(stats.averageLoad).toBe(50);
      expect(stats.capabilitiesCount).toBeDefined();
      expect(stats.capabilitiesCount['test']).toBe(2);
    });
  });

  describe('cleanup', () => {
    it('should stop discovery service', async () => {
      await agentDiscovery.stop();
      
      // Should not throw error
      expect(true).toBe(true);
    });
  });

  describe('static methods', () => {
    it('should create agent card', () => {
      const config = {
        id: 'test-agent',
        name: 'Test Agent',
        description: 'A test agent',
        version: '1.0.0',
        url: 'http://localhost:3001',
        capabilities: ['test'],
        skills: [{
          id: 'test-skill',
          name: 'Test Skill',
          description: 'A test skill',
          tags: ['test']
        }]
      };
      
      const agentCard = AgentDiscovery.createAgentCard(config);
      
      expect(agentCard).toBeDefined();
      expect(agentCard.name).toBe('Test Agent');
      expect(agentCard.version).toBe('1.0.0');
    });
  });
});