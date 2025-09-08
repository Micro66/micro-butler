import { AgentRegistry, AgentConfig } from './AgentRegistry';
import { AgentDiscovery } from './AgentDiscovery';

export interface A2ASystemConfig {
  port?: number;
  host?: string;
  enableDiscovery?: boolean;
}

export class A2ASystem {
  private registry: AgentRegistry;
  private discovery: AgentDiscovery;
  private config: A2ASystemConfig;
  private isRunning: boolean = false;

  constructor(config: A2ASystemConfig = {}) {
    this.config = {
      port: 3001,
      host: 'localhost',
      enableDiscovery: true,
      ...config
    };

    this.discovery = new AgentDiscovery();
    this.registry = new AgentRegistry(this.discovery);
  }

  /**
   * Initialize the A2A system
   */
  async initialize(): Promise<void> {
    if (this.isRunning) {
      console.log('A2A System is already running');
      return;
    }

    console.log('Initializing A2A System...');
    this.isRunning = true;
    console.log('A2A System initialized successfully');
  }

  /**
   * Start the A2A system
   */
  async start(): Promise<void> {
    if (!this.isRunning) {
      await this.initialize();
    }

    console.log('Starting A2A System...');
    console.log(`A2A System started on ${this.config.host}:${this.config.port}`);
    this.logSystemStatus();
  }

  /**
   * Stop the A2A system
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('A2A System is not running');
      return;
    }

    console.log('Stopping A2A System...');
    await this.registry.stopAllAgents();
    this.isRunning = false;
    console.log('A2A System stopped successfully');
  }

  /**
   * Get the agent registry
   */
  getRegistry(): AgentRegistry {
    return this.registry;
  }

  /**
   * Get the discovery service
   */
  getDiscovery(): AgentDiscovery {
    return this.discovery;
  }

  /**
   * Get system status
   */
  getStatus(): {
    isRunning: boolean;
    config: A2ASystemConfig;
    stats: any;
  } {
    return {
      isRunning: this.isRunning,
      config: this.config,
      stats: this.registry.getStatistics()
    };
  }

  /**
   * Add a new agent to the system
   */
  async addAgent(agent: any, config: AgentConfig): Promise<void> {
    await this.registry.registerAgent(agent, config);

    if (this.isRunning && config.autoStart !== false) {
      await this.registry.startAgent(config.id);
    }
  }

  /**
   * Remove an agent from the system
   */
  async removeAgent(agentId: string): Promise<void> {
    await this.registry.unregisterAgent(agentId);
  }

  /**
   * Log system status
   */
  private logSystemStatus(): void {
    const stats = this.registry.getStatistics();
    console.log('=== A2A System Status ===');
    console.log(`Total Agents: ${stats.totalAgents}`);
    console.log(`Running Agents: ${stats.runningAgents}`);
    console.log(`Discovery Service: ${this.config.enableDiscovery ? 'Enabled' : 'Disabled'}`);
    console.log('========================');
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down A2A System...');
    await this.stop();
    await this.registry.shutdown();
    console.log('A2A System shutdown complete');
  }
}

// Export singleton instance
let a2aSystemInstance: A2ASystem | null = null;

export function getA2ASystem(config?: A2ASystemConfig): A2ASystem {
  if (!a2aSystemInstance) {
    a2aSystemInstance = new A2ASystem(config);
  }
  return a2aSystemInstance;
}

export function resetA2ASystem(): void {
  a2aSystemInstance = null;
}