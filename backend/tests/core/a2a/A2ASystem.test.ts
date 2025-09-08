import { A2ASystem, A2ASystemConfig, getA2ASystem, resetA2ASystem } from '../../../src/core/agent/a2a/A2ASystem';
import { AgentConfig } from '../../../src/core/agent/a2a/AgentRegistry';

describe('A2ASystem', () => {
  let a2aSystem: A2ASystem;

  beforeEach(() => {
    resetA2ASystem();
    const config: A2ASystemConfig = {
      port: 3000,
      host: 'localhost',
      enableDiscovery: true
    };
    a2aSystem = new A2ASystem(config);
  });

  afterEach(async () => {
    await a2aSystem.stop();
    resetA2ASystem();
  });

  describe('constructor', () => {
    it('should create A2ASystem instance with default configuration', () => {
      const system = new A2ASystem();
      expect(system).toBeDefined();
      expect(system.getStatus().isRunning).toBe(false);
    });

    it('should create A2ASystem instance with custom configuration', () => {
      const config: A2ASystemConfig = {
        port: 4000,
        host: '0.0.0.0',
        enableDiscovery: false
      };
      const system = new A2ASystem(config);
      expect(system).toBeDefined();
      expect(system.getStatus().config.port).toBe(4000);
      expect(system.getStatus().config.host).toBe('0.0.0.0');
      expect(system.getStatus().config.enableDiscovery).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize the A2A system successfully', async () => {
      await a2aSystem.initialize();
      expect(a2aSystem.getStatus().isRunning).toBe(true);
    });

    it('should not initialize if already running', async () => {
      await a2aSystem.initialize();
      const consoleSpy = jest.spyOn(console, 'log');
      
      await a2aSystem.initialize();
      expect(consoleSpy).toHaveBeenCalledWith('A2A System is already running');
      
      consoleSpy.mockRestore();
    });
  });

  describe('start', () => {
    it('should start the A2A system successfully', async () => {
      await a2aSystem.start();
      expect(a2aSystem.getStatus().isRunning).toBe(true);
    });

    it('should initialize if not running when start is called', async () => {
      const initializeSpy = jest.spyOn(a2aSystem, 'initialize');
      
      await a2aSystem.start();
      expect(initializeSpy).toHaveBeenCalled();
      
      initializeSpy.mockRestore();
    });
  });

  describe('stop', () => {
    it('should stop the A2A system successfully', async () => {
      await a2aSystem.start();
      await a2aSystem.stop();
      
      expect(a2aSystem.getStatus().isRunning).toBe(false);
    });

    it('should not stop if not running', async () => {
      const consoleSpy = jest.spyOn(console, 'log');
      
      await a2aSystem.stop();
      expect(consoleSpy).toHaveBeenCalledWith('A2A System is not running');
      
      consoleSpy.mockRestore();
    });
  });

  describe('getRegistry', () => {
    it('should return the agent registry', () => {
      const registry = a2aSystem.getRegistry();
      expect(registry).toBeDefined();
    });
  });

  describe('getDiscovery', () => {
    it('should return the discovery service', () => {
      const discovery = a2aSystem.getDiscovery();
      expect(discovery).toBeDefined();
    });
  });

  describe('getStatus', () => {
    it('should return correct status when stopped', () => {
      const status = a2aSystem.getStatus();
      
      expect(status.isRunning).toBe(false);
      expect(status.config).toBeDefined();
      expect(status.stats).toBeDefined();
    });

    it('should return correct status when running', async () => {
      await a2aSystem.start();
      const status = a2aSystem.getStatus();
      
      expect(status.isRunning).toBe(true);
      expect(status.config).toBeDefined();
      expect(status.stats).toBeDefined();
    });
  });

  describe('addAgent', () => {
    it('should add agent to registry', async () => {
      const agentConfig: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'worker',
        capabilities: ['test']
      };

      const mockAgent = {
        start: jest.fn(),
        stop: jest.fn(),
        getAgentCard: jest.fn()
      };

      await a2aSystem.addAgent(mockAgent, agentConfig);
      
      // Verify agent was added by checking registry
      const registry = a2aSystem.getRegistry();
      const agent = registry.getAgent('test-agent');
      expect(agent).toBeDefined();
    });
  });

  describe('removeAgent', () => {
    it('should remove agent from registry', async () => {
      // First add an agent
      const agentConfig: AgentConfig = {
        id: 'test-agent',
        name: 'Test Agent',
        type: 'worker',
        capabilities: ['test']
      };

      const mockAgent = {
        start: jest.fn(),
        stop: jest.fn(),
        getAgentCard: jest.fn()
      };

      await a2aSystem.addAgent(mockAgent, agentConfig);
      
      // Then remove it
      await a2aSystem.removeAgent('test-agent');
      
      // Verify agent was removed
      const registry = a2aSystem.getRegistry();
      const agent = registry.getAgent('test-agent');
      expect(agent).toBeNull();
    });
  });

  describe('shutdown', () => {
    it('should shutdown the A2A system', async () => {
      await a2aSystem.start();
      await a2aSystem.shutdown();
      
      expect(a2aSystem.getStatus().isRunning).toBe(false);
    });
  });
});

describe('A2ASystem Factory Functions', () => {
  beforeEach(() => {
    resetA2ASystem();
  });

  afterEach(() => {
    resetA2ASystem();
  });

  describe('getA2ASystem', () => {
    it('should return singleton instance', () => {
      const system1 = getA2ASystem();
      const system2 = getA2ASystem();
      
      expect(system1).toBe(system2);
    });

    it('should create new instance with custom config', () => {
      const config: A2ASystemConfig = {
        port: 5000,
        host: '127.0.0.1'
      };
      
      const system = getA2ASystem(config);
      expect(system.getStatus().config.port).toBe(5000);
      expect(system.getStatus().config.host).toBe('127.0.0.1');
    });
  });

  describe('resetA2ASystem', () => {
    it('should reset the singleton instance', () => {
      const system1 = getA2ASystem();
      resetA2ASystem();
      const system2 = getA2ASystem();
      
      expect(system1).not.toBe(system2);
    });
  });
});