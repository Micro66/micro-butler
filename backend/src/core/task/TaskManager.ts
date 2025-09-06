import { Task } from './Task';
import { TaskStatus, ApiConfiguration, TaskStatusUpdate, CreateTaskRequest, TaskMetadata, ClineMessage, TodoItem } from '@/types';
import { TaskStorage, StoredTask, TaskQuery } from '@/storage/TaskStorage';
import { ConfigManager } from '@/config/ConfigManager';
import { Logger } from 'winston';
import { EventEmitter } from 'node:events';
import { v4 as uuidv4 } from 'uuid';

export interface TaskListResult {
  tasks: Task[];
  total: number;
}

export interface TaskListOptions {
  page: number;
  limit: number;
  status?: string;
}

export class TaskManager extends EventEmitter {
  private tasks: Map<string, Task> = new Map();
  private logger: Logger;
  private taskStorage: TaskStorage;
  private configManager: ConfigManager;

  constructor(logger: Logger, taskStorage: TaskStorage, configManager: ConfigManager) {
    super();
    this.logger = logger;
    this.taskStorage = taskStorage;
    this.configManager = configManager;
    
    // 初始化存储
    this.initializeStorage();
  }

  /**
   * 初始化存储
   */
  private async initializeStorage(): Promise<void> {
    try {
      await this.taskStorage.initialize();
      this.logger.info('Task storage initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize task storage', { error });
      throw error;
    }
  }

  /**
   * 创建新任务
   */
  async createTask(request: CreateTaskRequest): Promise<string> {
    const taskId = uuidv4();
    
    try {
      // 获取 API 配置 - 让Task类处理默认值
      const apiConfiguration = request.apiConfiguration || request.configuration;
      
      // 创建任务实例
      const taskOptions: any = {
        taskId,
        workspacePath: request.workspacePath || process.cwd(),
        configManager: this.configManager,
        task: request.task,
        images: request.images || []
      };
      
      // 只在有值时才添加apiConfiguration
      if (apiConfiguration) {
        taskOptions.apiConfiguration = apiConfiguration;
      }
      
      const task = new Task(taskOptions);
      
      // 添加到任务映射
      this.tasks.set(taskId, task);
      this.emit('taskCreated', task);
      
      // 监听任务状态变化并自动保存
      task.on('statusChange', async (status: TaskStatus) => {
        try {
          await this.taskStorage.updateTaskStatus(taskId, status);
          this.emit('taskStatusUpdate', { taskId, status, timestamp: Date.now() } as TaskStatusUpdate);
        } catch (error) {
          this.logger.error('Failed to update task status in storage', { taskId, status, error });
        }
      });
      
      // 保存任务到存储
      const storedTask: StoredTask = {
        taskId,
        metadata: task.metadata,
        status: task.getStatus(),
        messages: task.getMessages(),
        todos: task.getTodos(),
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await this.taskStorage.saveTask(storedTask);
      
      this.logger.info('Task created successfully', { taskId });
      return taskId;
      
    } catch (error) {
      this.logger.error('Failed to create task', { taskId, error });
      throw error;
    }
  }

  /**
   * 获取任务
   */
  async getTask(taskId: string): Promise<Task | null> {
    let task = this.tasks.get(taskId);
    
    // 如果内存中没有，尝试从存储中加载
    if (!task) {
      const storedTask = await this.taskStorage.getTask(taskId);
      if (storedTask) {
        task = await this.restoreTaskFromStorage(storedTask);
        if (task) {
          this.tasks.set(taskId, task);
        }
      }
    }
    
    return task || null;
  }

  /**
   * 直接从存储获取任务数据
   */
  async getStoredTask(taskId: string): Promise<StoredTask | null> {
    return await this.taskStorage.getTask(taskId);
  }

  /**
   * 从存储恢复任务
   */
  private async restoreTaskFromStorage(storedTask: StoredTask): Promise<Task | undefined> {
    try {
      // 这里需要根据存储的任务数据重新创建Task实例
      // 由于Task构造函数需要特定参数，这里简化处理
      const task = new Task({
        taskId: storedTask.taskId,
        task: storedTask.metadata.task || '',
        images: storedTask.metadata.images || [],
        workspacePath: process.cwd(), // 从存储中无法恢复，使用默认值
        configManager: this.configManager
      });
      
      // 恢复任务状态和数据
      // 注意：由于Task类没有直接的setter方法，我们需要通过其他方式恢复状态
      // 这里暂时返回新创建的任务，实际状态恢复需要Task类支持
      
      return task;
    } catch (error) {
      this.logger.error('Failed to restore task from storage', { taskId: storedTask.taskId, error });
      return undefined;
    }
  }

  /**
   * 获取任务列表
   */
  async listTasks(options: TaskListOptions): Promise<TaskListResult> {
    const query: TaskQuery = {
      status: options.status as TaskStatus,
      limit: options.limit,
      offset: (options.page - 1) * options.limit
    };
    
    const storedTasks = await this.taskStorage.queryTasks(query);
    const tasks: Task[] = [];
    
    for (const storedTask of storedTasks) {
      let task = this.tasks.get(storedTask.taskId);
      if (!task) {
        task = await this.restoreTaskFromStorage(storedTask);
        if (task) {
          this.tasks.set(storedTask.taskId, task);
        }
      }
      if (task) {
        tasks.push(task);
      }
    }
    
    // 获取总数
    const stats = await this.taskStorage.getStats();
    const total = options.status ? stats.tasksByStatus[options.status as TaskStatus] : stats.totalTasks;
    
    return { tasks, total };
  }

  /**
   * 启动任务
   */
  async startTask(taskId: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    this.logger.info('Starting task', { taskId });
    
    try {
      // 更新状态为运行中
      await this.taskStorage.updateTaskStatus(taskId, 'running');
      
      // 实际启动任务执行
      await task.startTask(task.metadata.task, task.metadata.images);
      
      this.emit('taskStarted', taskId);
      this.logger.info('Task started successfully', { taskId });
    } catch (error) {
      this.logger.error('Failed to start task', { 
        taskId, 
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error 
      });
      await this.taskStorage.updateTaskStatus(taskId, 'failed');
      throw error;
    }
  }

  /**
   * 暂停任务
   */
  async pauseTask(taskId: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    this.logger.info('Pausing task', { taskId });
    
    // 暂停任务
    await task.pauseTask();
    
    // 手动更新状态到存储
    await this.taskStorage.updateTaskStatus(taskId, 'paused');
    
    this.emit('taskPaused', taskId);
  }

  /**
   * 恢复任务
   */
  async resumeTask(taskId: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    this.logger.info('Resuming task', { taskId });
    
    // 恢复任务
    await task.resumeTask();
    
    // 手动更新状态到存储
    await this.taskStorage.updateTaskStatus(taskId, 'running');
    
    this.emit('taskResumed', taskId);
  }

  /**
   * 中止任务
   */
  async abortTask(taskId: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    this.logger.info('Aborting task', { taskId });
    
    // 中止任务
    await task.abortTask();
    
    // 手动更新状态到存储
    await this.taskStorage.updateTaskStatus(taskId, 'aborted');
    
    this.emit('taskAborted', taskId);
  }

  /**
   * 删除任务
   */
  async deleteTask(taskId: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    // 如果任务正在运行，先中止
    if (task.getStatus() === 'running') {
      // TODO: 实现Task.abort()方法
      // await task.abort();
    }
    
    this.tasks.delete(taskId);
    
    // 从存储中删除
    await this.taskStorage.deleteTask(taskId);
    
    this.logger.info('Task deleted', { taskId });
  }

  /**
   * 获取任务统计信息
   */
  async getTaskStats(): Promise<{
    total: number;
    running: number;
    completed: number;
    failed: number;
    paused: number;
  }> {
    const stats = await this.taskStorage.getStats();
    
    return {
      total: stats.totalTasks,
      running: stats.tasksByStatus.running,
      completed: stats.tasksByStatus.completed,
      failed: stats.tasksByStatus.failed,
      paused: stats.tasksByStatus.paused
    };
  }

  /**
   * 清理过期任务
   */
  async cleanup(): Promise<void> {
    try {
      const deletedCount = await this.taskStorage.cleanup();
      this.logger.info('Task cleanup completed', { deletedCount });
    } catch (error) {
      this.logger.error('Task cleanup failed', { error });
      throw error;
    }
  }

  /**
   * 关闭任务管理器
   */
  async close(): Promise<void> {
    try {
      await this.taskStorage.close();
      this.logger.info('Task manager closed');
    } catch (error) {
      this.logger.error('Failed to close task manager', { error });
      throw error;
    }
  }
}