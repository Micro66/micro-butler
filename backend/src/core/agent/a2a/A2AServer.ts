import type { AgentCard } from '@a2a-js/sdk';
import { Logger } from 'winston';
import { A2ARequestHandler } from './A2ARequestHandler';
import { TaskManager } from '@/core/task/TaskManager';
import { MICRO_BUTLER_AGENT_CARD } from './config/agent-card';

/**
 * A2A服务器配置接口
 */
export interface A2AServerConfig {
  agentCard: AgentCard;
  port?: number;
  host?: string;
  enableCors?: boolean;
  maxConcurrentTasks?: number;
}

/**
 * A2A服务器主类
 * 负责管理Agent间通信和任务协调
 */
export class A2AServer {
  private logger: Logger;
  private config: A2AServerConfig;
  private requestHandler: A2ARequestHandler;
  private taskManager: TaskManager;
  private isRunning: boolean = false;

  constructor(
    logger: Logger,
    taskManager: TaskManager,
    config: A2AServerConfig
  ) {
    this.logger = logger;
    this.taskManager = taskManager;
    this.config = config;
    this.requestHandler = new A2ARequestHandler(logger, taskManager);
  }

  /**
   * 启动A2A服务器
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('A2A server is already running');
      return;
    }

    try {
      this.logger.info('Starting A2A server', {
        agentName: this.config.agentCard.name,
        version: this.config.agentCard.version,
        port: this.config.port || 3001,
        host: this.config.host || 'localhost'
      });

      // 验证Agent Card
      this.validateAgentCard();

      // 任务管理器已在构造时初始化

      this.isRunning = true;
      this.logger.info('A2A server started successfully');
    } catch (error) {
      this.logger.error('Failed to start A2A server', { error });
      throw error;
    }
  }

  /**
   * 停止A2A服务器
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      this.logger.warn('A2A server is not running');
      return;
    }

    try {
      this.logger.info('Stopping A2A server');
      
      // 清理请求处理器
      await this.requestHandler.cleanup();
      
      this.isRunning = false;
      this.logger.info('A2A server stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping A2A server', { error });
      throw error;
    }
  }

  /**
   * 获取Agent Card
   */
  getAgentCard(): AgentCard {
    return this.config.agentCard;
  }

  /**
   * 获取请求处理器
   */
  getRequestHandler(): A2ARequestHandler {
    return this.requestHandler;
  }

  /**
   * 获取服务器状态
   */
  getStatus(): {
    isRunning: boolean;
    activeTaskCount: number;
    agentInfo: {
      name: string;
      version: string;
      description?: string;
    };
  } {
    return {
      isRunning: this.isRunning,
      activeTaskCount: this.requestHandler.getActiveTaskCount(),
      agentInfo: {
        name: this.config.agentCard.name,
        version: this.config.agentCard.version,
        description: this.config.agentCard.description
      }
    };
  }

  /**
   * 更新Agent Card
   */
  updateAgentCard(agentCard: Partial<AgentCard>): void {
    this.config.agentCard = { ...this.config.agentCard, ...agentCard };
    this.logger.info('Agent card updated', { 
      name: this.config.agentCard.name,
      version: this.config.agentCard.version 
    });
  }

  /**
   * 验证Agent Card的有效性
   */
  private validateAgentCard(): void {
    const { agentCard } = this.config;
    
    if (!agentCard.name || !agentCard.version) {
      throw new Error('Agent card must have name and version');
    }

    if (!agentCard.capabilities) {
      this.logger.warn('Agent card has no capabilities defined');
    }

    this.logger.debug('Agent card validation passed', {
      name: agentCard.name,
      version: agentCard.version,
      hasCapabilities: !!agentCard.capabilities
    });
  }
}