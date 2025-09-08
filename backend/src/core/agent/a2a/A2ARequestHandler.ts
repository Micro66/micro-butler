import type { Message, Task as A2ATask } from '@a2a-js/sdk';
import { RequestContext, ExecutionEventBus, DefaultExecutionEventBus } from '@a2a-js/sdk/dist/server/index.js';
import { Logger } from 'winston';
import { MicroButlerAgentExecutor } from './AgentExecutor';
import { TaskManager } from '@/core/task/TaskManager';

/**
 * A2A请求处理器
 * 负责处理来自其他Agent的请求并协调任务执行
 */
export class A2ARequestHandler {
  private logger: Logger;
  private agentExecutor: MicroButlerAgentExecutor;
  private eventBusMap: Map<string, ExecutionEventBus> = new Map();

  constructor(logger: Logger, taskManager: TaskManager) {
    this.logger = logger;
    this.agentExecutor = new MicroButlerAgentExecutor(logger, taskManager);
  }

  /**
   * 处理发送消息请求
   */
  async handleSendMessage(userMessage: Message, taskId?: string, referenceTasks?: A2ATask[]): Promise<ExecutionEventBus> {
    const contextId = `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const actualTaskId = taskId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.logger.info('Handling A2A send message request', { 
      contextId, 
      taskId: actualTaskId,
      messageRole: userMessage.role 
    });

    // 创建请求上下文
    const requestContext = new RequestContext(
      userMessage,
      actualTaskId,
      contextId,
      undefined, // task - 将在执行过程中创建
      referenceTasks
    );

    // 创建事件总线
    const eventBus = new DefaultExecutionEventBus();
    this.eventBusMap.set(actualTaskId, eventBus);

    // 异步执行任务
    this.executeTask(requestContext, eventBus).catch(error => {
      this.logger.error('Error executing A2A task', { 
        taskId: actualTaskId, 
        error: error.message 
      });
    });

    return eventBus;
  }

  /**
   * 处理取消任务请求
   */
  async handleCancelTask(taskId: string): Promise<void> {
    this.logger.info('Handling A2A cancel task request', { taskId });
    
    const eventBus = this.eventBusMap.get(taskId);
    if (eventBus) {
      await this.agentExecutor.cancelTask(taskId, eventBus);
      this.eventBusMap.delete(taskId);
    } else {
      this.logger.warn('Task not found for cancellation', { taskId });
      throw new Error(`Task ${taskId} not found`);
    }
  }

  /**
   * 获取任务状态
   */
  getTaskEventBus(taskId: string): ExecutionEventBus | undefined {
    return this.eventBusMap.get(taskId);
  }

  /**
   * 获取活跃任务数量
   */
  getActiveTaskCount(): number {
    return this.agentExecutor.getActiveTaskCount();
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up A2A request handler');
    
    // 清理所有事件总线
    for (const [taskId, eventBus] of this.eventBusMap.entries()) {
      try {
        eventBus.finished();
      } catch (error) {
        this.logger.error('Error finishing event bus', { taskId, error });
      }
    }
    this.eventBusMap.clear();
    
    // 清理执行器
    await this.agentExecutor.cleanup();
  }

  /**
   * 执行任务的私有方法
   */
  private async executeTask(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    try {
      await this.agentExecutor.execute(requestContext, eventBus);
    } catch (error) {
      this.logger.error('Task execution failed', { 
        taskId: requestContext.taskId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      
      // 确保事件总线被正确结束
      eventBus.finished();
    } finally {
      // 清理事件总线映射
      this.eventBusMap.delete(requestContext.taskId);
    }
  }
}