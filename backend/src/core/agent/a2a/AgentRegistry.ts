import { AgentDiscovery, AgentRegistration } from './AgentDiscovery';
import { WorkerAgent } from './WorkerAgent';
import { LeaderAgent } from './LeaderAgent';

export interface AgentConfig {
  id: string;
  name: string;
  type: 'leader' | 'worker';
  capabilities: string[];
  endpoint?: string;
  autoStart?: boolean;
}

export interface AgentInstance {
  id: string;
  agent: WorkerAgent | LeaderAgent;
  config: AgentConfig;
  status: 'stopped' | 'starting' | 'running' | 'stopping' | 'error';
  error?: string;
  startedAt?: Date;
}

export class AgentRegistry {
  private agents: Map<string, AgentInstance> = new Map();
  private discovery: AgentDiscovery;

  constructor(discovery: AgentDiscovery) {
    this.discovery = discovery;
  }

  /**
   * Register a new agent with the registry
   */
  async registerAgent(agent: WorkerAgent | LeaderAgent, config: AgentConfig): Promise<void> {
    if (this.agents.has(config.id)) {
      throw new Error(`Agent with id ${config.id} is already registered`);
    }

    const instance: AgentInstance = {
      id: config.id,
      agent,
      config,
      status: 'stopped'
    };

    this.agents.set(config.id, instance);
    console.log(`Agent registered: ${config.id} (${config.name})`);

    // Auto-start if configured
    if (config.autoStart) {
      await this.startAgent(config.id);
    }
  }

  /**
   * Unregister an agent from the registry
   */
  async unregisterAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Stop the agent if it's running
    if (instance.status === 'running') {
      await this.stopAgent(agentId);
    }

    this.agents.delete(agentId);
    console.log(`Agent unregistered: ${agentId}`);
  }

  /**
   * Start an agent
   */
  async startAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (instance.status === 'running') {
      console.log(`Agent ${agentId} is already running`);
      return;
    }

    try {
      instance.status = 'starting';
      console.log(`Starting agent: ${agentId}`);

      // Start the agent
      await instance.agent.start();

      // Register with discovery service if it's a worker agent
      if (instance.config.type === 'worker' && instance.agent instanceof WorkerAgent) {
        const agentCard = this.createAgentCard(instance);
        const registration: Omit<AgentRegistration, 'lastSeen'> = {
          id: instance.id,
          card: agentCard,
          endpoint: instance.config.endpoint || `http://localhost:3000/agents/${instance.id}`,
          status: 'online',
          capabilities: instance.config.capabilities,
          load: 0
        };

        await this.discovery.registerAgent(registration);
      }

      instance.status = 'running';
      instance.startedAt = new Date();
      console.log(`Agent started successfully: ${agentId}`);
    } catch (error) {
      instance.status = 'error';
      instance.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to start agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Stop an agent
   */
  async stopAgent(agentId: string): Promise<void> {
    const instance = this.agents.get(agentId);
    if (!instance) {
      throw new Error(`Agent ${agentId} not found`);
    }

    if (instance.status === 'stopped') {
      console.log(`Agent ${agentId} is already stopped`);
      return;
    }

    try {
      instance.status = 'stopping';
      console.log(`Stopping agent: ${agentId}`);

      // Unregister from discovery service
      await this.discovery.unregisterAgent(agentId);

      // Stop the agent
      await instance.agent.stop();

      instance.status = 'stopped';
      delete instance.startedAt;
      delete instance.error;
      console.log(`Agent stopped successfully: ${agentId}`);
    } catch (error) {
      instance.status = 'error';
      instance.error = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to stop agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Restart an agent
   */
  async restartAgent(agentId: string): Promise<void> {
    await this.stopAgent(agentId);
    await this.startAgent(agentId);
  }

  /**
   * Get agent instance by ID
   */
  getAgent(agentId: string): AgentInstance | null {
    return this.agents.get(agentId) ?? null;
  }

  /**
   * Get all registered agents
   */
  getAllAgents(): AgentInstance[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by status
   */
  getAgentsByStatus(status: AgentInstance['status']): AgentInstance[] {
    return Array.from(this.agents.values()).filter(instance => instance.status === status);
  }

  /**
   * Get agents by type
   */
  getAgentsByType(type: 'leader' | 'worker'): AgentInstance[] {
    return Array.from(this.agents.values()).filter(instance => instance.config.type === type);
  }

  /**
   * Start all registered agents
   */
  async startAllAgents(): Promise<void> {
    const startPromises = Array.from(this.agents.keys()).map(agentId => 
      this.startAgent(agentId).catch(error => {
        console.error(`Failed to start agent ${agentId}:`, error);
      })
    );

    await Promise.all(startPromises);
  }

  /**
   * Stop all running agents
   */
  async stopAllAgents(): Promise<void> {
    const runningAgents = this.getAgentsByStatus('running');
    const stopPromises = runningAgents.map(instance => 
      this.stopAgent(instance.id).catch(error => {
        console.error(`Failed to stop agent ${instance.id}:`, error);
      })
    );

    await Promise.all(stopPromises);
  }

  /**
   * Update agent heartbeat and load
   */
  async updateAgentStatus(agentId: string, load: number): Promise<void> {
    const instance = this.agents.get(agentId);
    if (instance && instance.status === 'running') {
      const status = load > 90 ? 'busy' : 'online';
      await this.discovery.updateAgentHeartbeat(agentId, status, load);
    }
  }

  /**
   * Get registry statistics
   */
  getStatistics(): {
    totalAgents: number;
    runningAgents: number;
    stoppedAgents: number;
    errorAgents: number;
    leaderAgents: number;
    workerAgents: number;
  } {
    const allAgents = Array.from(this.agents.values());
    
    return {
      totalAgents: allAgents.length,
      runningAgents: allAgents.filter(a => a.status === 'running').length,
      stoppedAgents: allAgents.filter(a => a.status === 'stopped').length,
      errorAgents: allAgents.filter(a => a.status === 'error').length,
      leaderAgents: allAgents.filter(a => a.config.type === 'leader').length,
      workerAgents: allAgents.filter(a => a.config.type === 'worker').length
    };
  }

  /**
   * Create an agent card for discovery service
   */
  private createAgentCard(instance: AgentInstance): any {
    const skills = instance.agent instanceof WorkerAgent 
      ? Array.from((instance.agent as any).skills?.values() || [])
      : [];

    return {
      name: instance.config.name,
      description: `${instance.config.type} agent with capabilities: ${instance.config.capabilities.join(', ')}`,
      version: '1.0.0',
      url: instance.config.endpoint || `http://localhost:3000/agents/${instance.id}`,
      protocolVersion: '1.0.0',
      capabilities: {
        supportsStreaming: false,
        supportsMultipleConnections: true
      },
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
      skills: skills.map((skill: any) => ({
        id: skill.id || skill.name,
        name: skill.name,
        description: skill.description,
        tags: skill.tags || [],
        inputModes: skill.inputModes || ['text'],
        outputModes: skill.outputModes || ['text']
      }))
    };
  }

  /**
   * Cleanup and shutdown the registry
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down agent registry...');
    await this.stopAllAgents();
    this.agents.clear();
    console.log('Agent registry shutdown complete');
  }
}