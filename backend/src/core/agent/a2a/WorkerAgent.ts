import { Logger } from 'winston';
import { EventEmitter } from 'node:events';
import type { AgentCard, Message, Task as A2ATask } from '@a2a-js/sdk';
import { MicroButlerAgentExecutor } from './AgentExecutor';
import { TaskManager } from '@/core/task/TaskManager';

/**
 * 技能定义接口
 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  inputModes: string[];
  outputModes: string[];
  execute: (message: Message, context: SkillContext) => Promise<SkillResult>;
}

/**
 * 技能执行上下文
 */
export interface SkillContext {
  taskId: string;
  agentId: string;
  logger: Logger;
  metadata?: Record<string, any>;
}

/**
 * 技能执行结果
 */
export interface SkillResult {
  success: boolean;
  result?: any;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Worker Agent配置
 */
export interface WorkerAgentConfig {
  agentId: string;
  name: string;
  description: string;
  version: string;
  url: string;
  maxConcurrentTasks?: number;
  healthCheckInterval?: number;
}

/**
 * Worker Agent基类
 * 所有具体的Agent实现都应该继承此类
 */
export abstract class WorkerAgent extends EventEmitter {
  protected logger: Logger;
  protected config: WorkerAgentConfig;
  protected taskManager: TaskManager;
  protected agentExecutor: MicroButlerAgentExecutor;
  protected registeredSkills: Map<string, Skill> = new Map();
  protected isRunning: boolean = false;
  protected activeTasks: Set<string> = new Set();
  protected healthCheckInterval?: NodeJS.Timeout;

  constructor(
    logger: Logger,
    taskManager: TaskManager,
    config: WorkerAgentConfig
  ) {
    super();
    this.logger = logger;
    this.taskManager = taskManager;
    this.config = config;
    this.agentExecutor = new MicroButlerAgentExecutor(logger, taskManager);
  }

  /**
   * 启动Worker Agent
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Worker agent is already running', { agentId: this.config.agentId });
      return;
    }

    try {
      this.logger.info('Starting worker agent', { agentId: this.config.agentId });
      
      // 初始化技能
      await this.initializeSkills();
      
      // 启动健康检查
      this.startHealthCheck();
      
      this.isRunning = true;
      this.emit('started', { agentId: this.config.agentId });
      
      this.logger.info('Worker agent started successfully', {
        agentId: this.config.agentId,
        skillCount: this.registeredSkills.size
      });
    } catch (error) {
      this.logger.error('Failed to start worker agent', {
        agentId: this.config.agentId,
        error
      });
      throw error;
    }
  }

  /**
   * 停止Worker Agent
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      this.logger.info('Stopping worker agent', { agentId: this.config.agentId });
      
      // 停止健康检查
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }
      
      // 等待活动任务完成或取消
      await this.cancelActiveTasks();
      
      // 清理资源
      await this.cleanup();
      
      this.isRunning = false;
      this.emit('stopped', { agentId: this.config.agentId });
      
      this.logger.info('Worker agent stopped', { agentId: this.config.agentId });
    } catch (error) {
      this.logger.error('Error stopping worker agent', {
        agentId: this.config.agentId,
        error
      });
      throw error;
    }
  }

  /**
   * 注册技能
   */
  registerSkill(skill: Skill): void {
    this.registeredSkills.set(skill.id, skill);
    this.logger.info('Skill registered', {
      agentId: this.config.agentId,
      skillId: skill.id,
      skillName: skill.name
    });
    this.emit('skillRegistered', { agentId: this.config.agentId, skill });
  }

  /**
   * 注销技能
   */
  unregisterSkill(skillId: string): boolean {
    const removed = this.registeredSkills.delete(skillId);
    if (removed) {
      this.logger.info('Skill unregistered', {
        agentId: this.config.agentId,
        skillId
      });
      this.emit('skillUnregistered', { agentId: this.config.agentId, skillId });
    }
    return removed;
  }

  /**
   * 执行技能
   */
  async executeSkill(
    skillId: string,
    message: Message,
    context: Partial<SkillContext> = {}
  ): Promise<SkillResult> {
    const skill = this.registeredSkills.get(skillId);
    if (!skill) {
      const error = `Skill not found: ${skillId}`;
      this.logger.error(error, { agentId: this.config.agentId, skillId });
      return {
        success: false,
        error
      };
    }

    const taskId = context.taskId || `task-${Date.now()}`;
    const fullContext: SkillContext = {
      taskId,
      agentId: this.config.agentId,
      logger: this.logger,
      ...context
    };

    try {
      this.activeTasks.add(taskId);
      this.emit('taskStarted', { agentId: this.config.agentId, taskId, skillId });
      
      this.logger.info('Executing skill', {
        agentId: this.config.agentId,
        taskId,
        skillId,
        skillName: skill.name
      });
      
      const result = await skill.execute(message, fullContext);
      
      this.emit('taskCompleted', {
        agentId: this.config.agentId,
        taskId,
        skillId,
        success: result.success
      });
      
      this.logger.info('Skill execution completed', {
        agentId: this.config.agentId,
        taskId,
        skillId,
        success: result.success
      });
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.emit('taskFailed', {
        agentId: this.config.agentId,
        taskId,
        skillId,
        error: errorMessage
      });
      
      this.logger.error('Skill execution failed', {
        agentId: this.config.agentId,
        taskId,
        skillId,
        error
      });
      
      return {
        success: false,
        error: errorMessage
      };
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * 获取Agent Card
   */
  getAgentCard(): AgentCard {
    const skills = Array.from(this.registeredSkills.values()).map(skill => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
      inputModes: skill.inputModes,
      outputModes: skill.outputModes
    }));

    return {
      name: this.config.name,
      version: this.config.version,
      description: this.config.description,
      url: this.config.url,
      protocolVersion: '1.0',
      defaultInputModes: ['text/plain'],
      defaultOutputModes: ['text/plain'],
      capabilities: {
        extensions: []
      },
      skills,
      provider: {
        organization: 'Micro Butler',
        url: 'https://github.com/roo-code/micro-butler'
      }
    };
  }

  /**
   * 获取注册的技能列表
   */
  getRegisteredSkills(): Skill[] {
    return Array.from(this.registeredSkills.values());
  }

  /**
   * 获取Agent状态
   */
  getStatus() {
    return {
      agentId: this.config.agentId,
      name: this.config.name,
      version: this.config.version,
      isRunning: this.isRunning,
      skillCount: this.registeredSkills.size,
      activeTaskCount: this.activeTasks.size,
      maxConcurrentTasks: this.config.maxConcurrentTasks || 5,
      registeredSkills: Array.from(this.registeredSkills.keys())
    };
  }

  /**
   * 检查是否可以接受新任务
   */
  canAcceptTask(): boolean {
    const maxTasks = this.config.maxConcurrentTasks || 5;
    return this.isRunning && this.activeTasks.size < maxTasks;
  }

  /**
   * 获取Agent执行器
   */
  getAgentExecutor(): MicroButlerAgentExecutor {
    return this.agentExecutor;
  }

  /**
   * 抽象方法：初始化技能
   * 子类必须实现此方法来注册具体的技能
   */
  protected abstract initializeSkills(): Promise<void>;

  /**
   * 抽象方法：清理资源
   * 子类可以重写此方法来清理特定资源
   */
  protected async cleanup(): Promise<void> {
    // 默认实现：清空技能注册
    this.registeredSkills.clear();
  }

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    const interval = this.config.healthCheckInterval || 60000; // 默认1分钟
    
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, interval);
  }

  /**
   * 执行健康检查
   */
  private performHealthCheck(): void {
    const status = this.getStatus();
    
    this.emit('healthCheck', {
      agentId: this.config.agentId,
      status,
      timestamp: new Date()
    });
    
    this.logger.debug('Health check performed', {
      agentId: this.config.agentId,
      isRunning: status.isRunning,
      activeTaskCount: status.activeTaskCount
    });
  }

  /**
   * 取消活动任务
   */
  private async cancelActiveTasks(): Promise<void> {
    const tasks = Array.from(this.activeTasks);
    
    for (const taskId of tasks) {
      try {
        this.logger.info('Cancelling active task', {
          agentId: this.config.agentId,
          taskId
        });
        
        // 这里可以添加具体的任务取消逻辑
        this.activeTasks.delete(taskId);
        
        this.emit('taskCancelled', {
          agentId: this.config.agentId,
          taskId
        });
      } catch (error) {
        this.logger.error('Failed to cancel task', {
          agentId: this.config.agentId,
          taskId,
          error
        });
      }
    }
  }
}