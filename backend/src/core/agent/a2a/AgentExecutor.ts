import type { Message, Task as A2ATask, TaskStatusUpdateEvent, TaskStatus as A2ATaskStatus } from '@a2a-js/sdk';
import { AgentExecutor, RequestContext, ExecutionEventBus } from '@a2a-js/sdk/dist/server';
import { Logger } from 'winston';
import { TaskManager } from '@/core/task/TaskManager';
import { Task } from '@/core/task/Task';
import { TaskStatus } from '@/types';

/**
 * A2A Agent执行器实现
 * 负责处理来自其他Agent的任务执行请求
 */
export class MicroButlerAgentExecutor implements AgentExecutor {
  private logger: Logger;
  private taskManager: TaskManager;
  private activeTasks: Map<string, Task> = new Map();

  constructor(logger: Logger, taskManager: TaskManager) {
    this.logger = logger;
    this.taskManager = taskManager;
  }

  /**
   * 执行Agent任务
   */
  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { taskId, userMessage } = requestContext;
    
    const firstPart = userMessage.parts?.[0];
    const messageText = (firstPart && firstPart.kind === 'text') ? firstPart.text : '';
    this.logger.info('Executing A2A task', { taskId, message: messageText.substring(0, 100) });

    try {
      // 创建内部任务
      const internalTaskId = await this.taskManager.createTask({
        task: messageText || 'Execute A2A task',
        workspacePath: process.cwd(),
        images: []
      });

      // 存储任务映射
      const task = await this.taskManager.getTask(internalTaskId);
      if (task) {
        this.activeTasks.set(taskId, task);
        
        // 启动任务
        await this.taskManager.startTask(internalTaskId);
        
        // 监听任务状态变化并发布事件
         task.on('statusChange', (status: TaskStatus) => {
           const statusEvent: TaskStatusUpdateEvent = {
             kind: 'status-update',
             contextId: requestContext.contextId,
             taskId: taskId,
             status: this.mapTaskStatus(status),
             final: status === 'completed' || status === 'failed' || status === 'aborted'
           };
           eventBus.publish(statusEvent);
           
           if (status === 'completed' || status === 'failed' || status === 'aborted') {
             this.activeTasks.delete(taskId);
             eventBus.finished();
           }
         });
        
        // 监听任务消息并转发
         task.on('task:message', (message: any) => {
           const a2aMessage: Message = {
             kind: 'message',
             messageId: `msg_${Date.now()}`,
             role: 'agent',
             parts: [{
               kind: 'text',
               text: message.content || message.text || ''
             }],
             contextId: requestContext.contextId
           };
           eventBus.publish(a2aMessage);
         });
      } else {
        throw new Error('Failed to create internal task');
      }
    } catch (error) {
      this.logger.error('Failed to execute A2A task', { taskId, error });
      
      // 发布错误状态
       const errorEvent: TaskStatusUpdateEvent = {
         kind: 'status-update',
         contextId: requestContext.contextId,
         taskId: taskId,
         status: {
           state: 'failed',
           message: {
             kind: 'message',
             messageId: `error_${Date.now()}`,
             role: 'agent',
             parts: [{
               kind: 'text',
               text: error instanceof Error ? error.message : 'Unknown error'
             }]
           }
         },
         final: true
       };
       eventBus.publish(errorEvent);
       eventBus.finished();
    }
  }

  /**
   * 取消任务执行
   */
  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    this.logger.info('Cancelling A2A task', { taskId });
    
    const task = this.activeTasks.get(taskId);
    if (task) {
      try {
        await this.taskManager.abortTask(task.taskId);
        this.activeTasks.delete(taskId);
        
        // 发布取消状态事件
         const cancelEvent: TaskStatusUpdateEvent = {
           kind: 'status-update',
           contextId: 'cancel_context',
           taskId: taskId,
           status: {
             state: 'canceled'
           },
           final: true
         };
         eventBus.publish(cancelEvent);
         eventBus.finished();
        
        this.logger.info('A2A task cancelled successfully', { taskId });
      } catch (error) {
        this.logger.error('Failed to cancel A2A task', { taskId, error });
        throw error;
      }
    } else {
      this.logger.warn('A2A task not found for cancellation', { taskId });
    }
  }

  /**
   * 获取活跃任务数量
   */
  getActiveTaskCount(): number {
    return this.activeTasks.size;
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up A2A Agent Executor');
    
    // 取消所有活跃任务
    const cancelPromises = Array.from(this.activeTasks.keys()).map(taskId => 
      this.cancelTask(taskId, {} as ExecutionEventBus).catch(error => 
        this.logger.error('Error cancelling task during cleanup', { taskId, error })
      )
    );
    
    await Promise.all(cancelPromises);
    this.activeTasks.clear();
  }

  /**
   * 将内部TaskStatus映射为A2A TaskStatus
   */
  private mapTaskStatus(status: TaskStatus): A2ATaskStatus {
    switch (status) {
      case 'pending':
        return { state: 'submitted' };
      case 'running':
        return { state: 'working' };
      case 'completed':
        return { state: 'completed' };
      case 'failed':
        return { state: 'failed' };
      case 'aborted':
        return { state: 'canceled' };
      default:
        return { state: 'submitted' };
    }
  }
}