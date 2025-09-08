// Import types - will be properly typed when a2a-js is available
type AgentCard = any;
type AgentSkill = any;

export interface AgentRegistration {
  id: string;
  card: AgentCard;
  endpoint: string;
  lastSeen: Date;
  status: 'online' | 'offline' | 'busy';
  capabilities: string[];
  load: number; // 0-100, current workload percentage
}

export interface DiscoveryQuery {
  capabilities?: string[];
  tags?: string[];
  maxLoad?: number;
  excludeIds?: string[];
}

export interface DiscoveryResult {
  agents: AgentRegistration[];
  totalFound: number;
}

export class AgentDiscovery {
  private agents: Map<string, AgentRegistration> = new Map();
  private discoveryInterval: NodeJS.Timeout | null = null;
  private readonly HEARTBEAT_TIMEOUT = 30000; // 30 seconds
  private readonly CLEANUP_INTERVAL = 60000; // 1 minute

  constructor() {
    this.startCleanupTimer();
  }

  /**
   * Register an agent with the discovery service
   */
  async registerAgent(registration: Omit<AgentRegistration, 'lastSeen'>): Promise<void> {
    const fullRegistration: AgentRegistration = {
      ...registration,
      lastSeen: new Date()
    };

    this.agents.set(registration.id, fullRegistration);
    console.log(`Agent registered: ${registration.id} (${registration.card.name})`);
  }

  /**
   * Unregister an agent from the discovery service
   */
  async unregisterAgent(agentId: string): Promise<void> {
    if (this.agents.delete(agentId)) {
      console.log(`Agent unregistered: ${agentId}`);
    }
  }

  /**
   * Update agent heartbeat and status
   */
  async updateAgentHeartbeat(agentId: string, status?: 'online' | 'offline' | 'busy', load?: number): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.lastSeen = new Date();
      if (status !== undefined) {
        agent.status = status;
      }
      if (load !== undefined) {
        agent.load = Math.max(0, Math.min(100, load));
      }
    }
  }

  /**
   * Discover agents based on query criteria
   */
  async discoverAgents(query: DiscoveryQuery = {}): Promise<DiscoveryResult> {
    const allAgents = Array.from(this.agents.values());
    
    // Filter by status (only online agents)
    let filteredAgents = allAgents.filter(agent => agent.status === 'online');

    // Filter by capabilities
    if (query.capabilities && query.capabilities.length > 0) {
      filteredAgents = filteredAgents.filter(agent => 
        query.capabilities!.some(cap => agent.capabilities.includes(cap))
      );
    }

    // Filter by tags (check agent card skills)
    if (query.tags && query.tags.length > 0) {
      filteredAgents = filteredAgents.filter(agent => {
        const agentTags = agent.card.skills.flatMap((skill: any) => skill.tags || []);
        return query.tags!.some(tag => agentTags.includes(tag));
      });
    }

    // Filter by load
    if (query.maxLoad !== undefined) {
      filteredAgents = filteredAgents.filter(agent => agent.load <= query.maxLoad!);
    }

    // Exclude specific agents
    if (query.excludeIds && query.excludeIds.length > 0) {
      filteredAgents = filteredAgents.filter(agent => !query.excludeIds!.includes(agent.id));
    }

    // Sort by load (prefer less loaded agents)
    filteredAgents.sort((a, b) => a.load - b.load);

    return {
      agents: filteredAgents,
      totalFound: filteredAgents.length
    };
  }

  /**
   * Get a specific agent by ID
   */
  async getAgent(agentId: string): Promise<AgentRegistration | null> {
    const agent = this.agents.get(agentId);
    return agent ?? null;
  }

  /**
   * Get all registered agents
   */
  async getAllAgents(): Promise<AgentRegistration[]> {
    return Array.from(this.agents.values());
  }

  /**
   * Find the best agent for a specific capability
   */
  async findBestAgent(capability: string, excludeIds: string[] = []): Promise<AgentRegistration | null> {
    const result = await this.discoverAgents({
      capabilities: [capability],
      excludeIds,
      maxLoad: 80 // Don't use agents that are too busy
    });

    return result.agents.length > 0 ? result.agents[0] : null;
  }

  /**
   * Get agent statistics
   */
  async getStatistics(): Promise<{
    totalAgents: number;
    onlineAgents: number;
    busyAgents: number;
    averageLoad: number;
    capabilitiesCount: Record<string, number>;
  }> {
    const allAgents = Array.from(this.agents.values());
    const onlineAgents = allAgents.filter(agent => agent.status === 'online');
    const busyAgents = allAgents.filter(agent => agent.status === 'busy');
    
    const totalLoad = allAgents.reduce((sum, agent) => sum + agent.load, 0);
    const averageLoad = allAgents.length > 0 ? totalLoad / allAgents.length : 0;

    // Count capabilities
    const capabilitiesCount: Record<string, number> = {};
    allAgents.forEach(agent => {
      agent.capabilities.forEach(cap => {
        capabilitiesCount[cap] = (capabilitiesCount[cap] || 0) + 1;
      });
    });

    return {
      totalAgents: allAgents.length,
      onlineAgents: onlineAgents.length,
      busyAgents: busyAgents.length,
      averageLoad: Math.round(averageLoad),
      capabilitiesCount
    };
  }

  /**
   * Start the cleanup timer to remove stale agents
   */
  private startCleanupTimer(): void {
    this.discoveryInterval = setInterval(() => {
      this.cleanupStaleAgents();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Remove agents that haven't sent heartbeat recently
   */
  private cleanupStaleAgents(): void {
    const now = new Date();
    const staleAgents: string[] = [];

    for (const [agentId, agent] of this.agents.entries()) {
      const timeSinceLastSeen = now.getTime() - agent.lastSeen.getTime();
      if (timeSinceLastSeen > this.HEARTBEAT_TIMEOUT) {
        staleAgents.push(agentId);
      }
    }

    staleAgents.forEach(agentId => {
      console.log(`Removing stale agent: ${agentId}`);
      this.agents.delete(agentId);
    });
  }

  /**
   * Stop the discovery service and cleanup
   */
  async stop(): Promise<void> {
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }
    this.agents.clear();
  }

  /**
   * Create an agent card for a worker agent
   */
  static createAgentCard(config: {
    id: string;
    name: string;
    description: string;
    version: string;
    url: string;
    capabilities: string[];
    skills: Array<{
      id: string;
      name: string;
      description: string;
      tags?: string[];
      inputModes?: string[];
      outputModes?: string[];
    }>;
  }): AgentCard {
    return {
      name: config.name,
      description: config.description,
      version: config.version,
      url: config.url,
      protocolVersion: '1.0.0',
      capabilities: {
        // Map capabilities to agent capabilities format
        supportsStreaming: false,
        supportsMultipleConnections: true
      },
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
      skills: config.skills.map(skill => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        tags: skill.tags || [],
        inputModes: skill.inputModes || ['text'],
        outputModes: skill.outputModes || ['text']
      }))
    };
  }
}

// Singleton instance for global use
export const agentDiscovery = new AgentDiscovery();