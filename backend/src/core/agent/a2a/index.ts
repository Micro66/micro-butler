import { Logger } from 'winston';
import { TaskManager } from '@/core/task/TaskManager';
import { A2AServer, A2AServerConfig } from './A2AServer';
import { MICRO_BUTLER_AGENT_CARD } from './config/agent-card';

// New A2A System Components
import { A2ASystem as NewA2ASystem, A2ASystemConfig, getA2ASystem } from './A2ASystem';
import { AgentRegistry, AgentConfig } from './AgentRegistry';
import { AgentDiscovery } from './AgentDiscovery';

/**
 * 创建并配置A2A服务器实例
 */
export function createA2AServer(
  logger: Logger,
  taskManager: TaskManager,
  options: Partial<A2AServerConfig> = {}
): A2AServer {
  const config: A2AServerConfig = {
    agentCard: MICRO_BUTLER_AGENT_CARD,
    port: 3001,
    host: 'localhost',
    enableCors: true,
    maxConcurrentTasks: 5,
    ...options
  };

  return new A2AServer(logger, taskManager, config);
}

/**
 * 导出主要组件
 */
export { A2AServer, A2AServerConfig } from './A2AServer';
export { A2ARequestHandler } from './A2ARequestHandler';
export { MicroButlerAgentExecutor } from './AgentExecutor';
export { MICRO_BUTLER_AGENT_CARD, createAgentCard } from './config/agent-card';

// Export new A2A System components
export { NewA2ASystem, A2ASystemConfig, getA2ASystem };
export { AgentRegistry, AgentConfig };
export { AgentDiscovery };
export { WorkerAgent } from './WorkerAgent';
export { LeaderAgent } from './LeaderAgent';
export { CodeAnalysisAgent, createCodeAnalysisAgent } from './agents/CodeAnalysisAgent';
export { DocumentationAgent, createDocumentationAgent } from './agents/DocumentationAgent';
export { TestGenerationAgent, createTestGenerationAgent } from './agents/TestGenerationAgent';

/**
 * A2A系统的主要入口点
 */
export class A2ASystem {
  private server: A2AServer;
  private logger: Logger;

  constructor(logger: Logger, taskManager: TaskManager, config?: Partial<A2AServerConfig>) {
    this.logger = logger;
    this.server = createA2AServer(logger, taskManager, config);
  }

  /**
   * 启动A2A系统
   */
  async start(): Promise<void> {
    try {
      await this.server.start();
      this.logger.info('A2A system started successfully');
    } catch (error) {
      this.logger.error('Failed to start A2A system', { error });
      throw error;
    }
  }

  /**
   * 停止A2A系统
   */
  async stop(): Promise<void> {
    try {
      await this.server.stop();
      this.logger.info('A2A system stopped successfully');
    } catch (error) {
      this.logger.error('Failed to stop A2A system', { error });
      throw error;
    }
  }

  /**
   * 获取服务器实例
   */
  getServer(): A2AServer {
    return this.server;
  }

  /**
   * 获取系统状态
   */
  getStatus() {
    return {
      ...this.server.getStatus(),
      systemInfo: {
        name: 'Micro Butler A2A System',
        version: '1.0.0'
      }
    };
  }

  /**
   * Get the new A2A system instance
   */
  getNewA2ASystem(): NewA2ASystem {
    return getA2ASystem();
  }
}

/**
 * Initialize the enhanced A2A system with both old and new components
 */
export async function initializeEnhancedA2ASystem(
  logger: Logger,
  taskManager: TaskManager,
  config?: {
    server?: Partial<A2AServerConfig>;
    newSystem?: A2ASystemConfig;
  }
): Promise<{ legacySystem: A2ASystem; newSystem: NewA2ASystem }> {
  // Initialize legacy A2A system
  const legacySystem = new A2ASystem(logger, taskManager, config?.server);
  
  // Initialize new A2A system
  const newSystem = getA2ASystem(config?.newSystem);
  await newSystem.initialize();
  
  return { legacySystem, newSystem };
}

/**
 * Health check for both systems
 */
export function createCombinedHealthCheck() {
  return async (req: any, res: any) => {
    try {
      const newSystem = getA2ASystem();
      const newStatus = newSystem.getStatus();
      
      res.json({
        status: 'ok',
        systems: {
          new: {
            running: newStatus.isRunning,
            agents: newStatus.stats,
            config: newStatus.config
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
}