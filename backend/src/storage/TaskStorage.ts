import { Task, TaskMetadata, TaskStatus, ClineMessage, TodoItem } from '@/types';
import { Logger } from 'winston';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';

export interface TaskStorageOptions {
  storageType?: 'file' | 'redis' | 'mongodb';
  storagePath?: string;
  connectionString?: string;
  maxTaskHistory?: number;
  cleanupInterval?: number;
}

export interface StoredTask {
  taskId: string;
  metadata: TaskMetadata;
  status: TaskStatus;
  messages: ClineMessage[];
  todos: TodoItem[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string;
}

export interface TaskQuery {
  status?: TaskStatus;
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
}

export interface TaskStorageStats {
  totalTasks: number;
  tasksByStatus: Record<TaskStatus, number>;
  oldestTask?: Date;
  newestTask?: Date;
  storageSize: number;
}

export abstract class TaskStorage extends EventEmitter {
  protected logger: Logger;
  protected options: TaskStorageOptions;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(options: TaskStorageOptions, logger: Logger) {
    super();
    this.options = options;
    this.logger = logger;
    
    // 启动定期清理
    if (options.cleanupInterval && options.cleanupInterval > 0) {
      this.startCleanup();
    }
  }

  /**
   * 初始化存储
   */
  abstract initialize(): Promise<void>;

  /**
   * 保存任务
   */
  abstract saveTask(task: StoredTask): Promise<void>;

  /**
   * 获取任务
   */
  abstract getTask(taskId: string): Promise<StoredTask | null>;

  /**
   * 更新任务状态
   */
  abstract updateTaskStatus(taskId: string, status: TaskStatus, error?: string): Promise<void>;

  /**
   * 更新任务消息
   */
  abstract updateTaskMessages(taskId: string, messages: ClineMessage[]): Promise<void>;

  /**
   * 更新任务待办事项
   */
  abstract updateTaskTodos(taskId: string, todos: TodoItem[]): Promise<void>;

  /**
   * 查询任务列表
   */
  abstract queryTasks(query: TaskQuery): Promise<StoredTask[]>;

  /**
   * 删除任务
   */
  abstract deleteTask(taskId: string): Promise<void>;

  /**
   * 获取存储统计信息
   */
  abstract getStats(): Promise<TaskStorageStats>;

  /**
   * 清理过期任务
   */
  abstract cleanup(): Promise<number>;

  /**
   * 关闭存储连接
   */
  abstract close(): Promise<void>;

  /**
   * 启动定期清理
   */
  private startCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    
    this.cleanupTimer = setInterval(async () => {
      try {
        const deletedCount = await this.cleanup();
        if (deletedCount > 0) {
          this.logger.info(`Cleaned up ${deletedCount} expired tasks`);
        }
      } catch (error) {
        this.logger.error('Failed to cleanup expired tasks', { error });
      }
    }, this.options.cleanupInterval);
  }

  /**
   * 停止定期清理
   */
  protected stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null as any;
    }
  }
}

/**
 * 文件存储实现
 */
export class FileTaskStorage extends TaskStorage {
  private storagePath: string;
  private tasksDir: string;
  private indexFile: string;
  private taskIndex: Map<string, StoredTask> = new Map();

  constructor(options: TaskStorageOptions = {}, logger: Logger) {
    super(options, logger);
    this.storagePath = options.storagePath || path.join(process.cwd(), 'data');
    this.tasksDir = path.join(this.storagePath, 'tasks');
    this.indexFile = path.join(this.storagePath, 'index.json');
  }

  async initialize(): Promise<void> {
    try {
      // 创建存储目录
      if (!fs.existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath, { recursive: true });
      }
      
      if (!fs.existsSync(this.tasksDir)) {
        fs.mkdirSync(this.tasksDir, { recursive: true });
      }
      
      // 加载任务索引
      await this.loadIndex();
      
      this.logger.info('File task storage initialized', {
        storagePath: this.storagePath,
        taskCount: this.taskIndex.size
      });
    } catch (error) {
      this.logger.error('Failed to initialize file task storage', { error });
      throw error;
    }
  }

  async saveTask(task: StoredTask): Promise<void> {
    try {
      const taskFile = path.join(this.tasksDir, `${task.taskId}.json`);
      
      // 保存任务文件
      fs.writeFileSync(taskFile, JSON.stringify(task, null, 2), 'utf-8');
      
      // 更新索引
      this.taskIndex.set(task.taskId, task);
      await this.saveIndex();
      
      this.emit('taskSaved', task);
      
      this.logger.debug('Task saved', { taskId: task.taskId });
    } catch (error) {
      this.logger.error('Failed to save task', { taskId: task.taskId, error });
      throw error;
    }
  }

  async getTask(taskId: string): Promise<StoredTask | null> {
    try {
      const taskFile = path.join(this.tasksDir, `${taskId}.json`);
      
      if (!fs.existsSync(taskFile)) {
        return null;
      }
      
      const taskData = fs.readFileSync(taskFile, 'utf-8');
      const task = JSON.parse(taskData) as StoredTask;
      
      // 转换日期字段
      task.createdAt = new Date(task.createdAt);
      task.updatedAt = new Date(task.updatedAt);
      if (task.completedAt) {
        task.completedAt = new Date(task.completedAt);
      }
      
      return task;
    } catch (error) {
      this.logger.error('Failed to get task', { taskId, error });
      return null;
    }
  }

  async updateTaskStatus(taskId: string, status: TaskStatus, error?: string): Promise<void> {
    try {
      const task = await this.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }
      
      task.status = status;
      task.updatedAt = new Date();
      
      if (error) {
        task.error = error;
      }
      
      if (status === 'completed' || status === 'failed' || status === 'aborted') {
        task.completedAt = new Date();
      }
      
      await this.saveTask(task);
      
      this.emit('taskStatusUpdated', { taskId, status, error });
    } catch (error) {
      this.logger.error('Failed to update task status', { taskId, status, error });
      throw error;
    }
  }

  async updateTaskMessages(taskId: string, messages: ClineMessage[]): Promise<void> {
    try {
      const task = await this.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }
      
      task.messages = messages;
      task.updatedAt = new Date();
      
      await this.saveTask(task);
      
      this.emit('taskMessagesUpdated', { taskId, messageCount: messages.length });
    } catch (error) {
      this.logger.error('Failed to update task messages', { taskId, error });
      throw error;
    }
  }

  async updateTaskTodos(taskId: string, todos: TodoItem[]): Promise<void> {
    try {
      const task = await this.getTask(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }
      
      task.todos = todos;
      task.updatedAt = new Date();
      
      await this.saveTask(task);
      
      this.emit('taskTodosUpdated', { taskId, todoCount: todos.length });
    } catch (error) {
      this.logger.error('Failed to update task todos', { taskId, error });
      throw error;
    }
  }

  async queryTasks(query: TaskQuery): Promise<StoredTask[]> {
    try {
      let tasks = Array.from(this.taskIndex.values());
      
      // 应用过滤条件
      if (query.status) {
        tasks = tasks.filter(task => task.status === query.status);
      }
      
      if (query.createdAfter) {
        tasks = tasks.filter(task => task.createdAt >= query.createdAfter!);
      }
      
      if (query.createdBefore) {
        tasks = tasks.filter(task => task.createdAt <= query.createdBefore!);
      }
      
      // 按创建时间倒序排序
      tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      
      // 应用分页
      const offset = query.offset || 0;
      const limit = query.limit || 100;
      
      return tasks.slice(offset, offset + limit);
    } catch (error) {
      this.logger.error('Failed to query tasks', { query, error });
      throw error;
    }
  }

  async deleteTask(taskId: string): Promise<void> {
    try {
      const taskFile = path.join(this.tasksDir, `${taskId}.json`);
      
      if (fs.existsSync(taskFile)) {
        fs.unlinkSync(taskFile);
      }
      
      this.taskIndex.delete(taskId);
      await this.saveIndex();
      
      this.emit('taskDeleted', { taskId });
      
      this.logger.debug('Task deleted', { taskId });
    } catch (error) {
      this.logger.error('Failed to delete task', { taskId, error });
      throw error;
    }
  }

  async getStats(): Promise<TaskStorageStats> {
    try {
      const tasks = Array.from(this.taskIndex.values());
      
      const stats: TaskStorageStats = {
        totalTasks: tasks.length,
        tasksByStatus: {
          'created': 0,
          'pending': 0,
          'running': 0,
          'paused': 0,
          'completed': 0,
          'failed': 0,
          'aborted': 0
        },
        storageSize: 0
      };
      
      // 统计任务状态
      for (const task of tasks) {
        stats.tasksByStatus[task.status]++;
      }
      
      // 获取最早和最新任务时间
      if (tasks.length > 0) {
        const sortedTasks = tasks.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        stats.oldestTask = sortedTasks[0]?.createdAt || new Date(0);
        stats.newestTask = sortedTasks[sortedTasks.length - 1]?.createdAt || new Date(0);
      }
      
      // 计算存储大小
      try {
        const storageStats = fs.statSync(this.storagePath);
        stats.storageSize = this.getDirectorySize(this.storagePath);
      } catch (error) {
        this.logger.warn('Failed to calculate storage size', { error });
      }
      
      return stats;
    } catch (error) {
      this.logger.error('Failed to get storage stats', { error });
      throw error;
    }
  }

  async cleanup(): Promise<number> {
    try {
      const maxHistory = this.options.maxTaskHistory || 1000;
      const tasks = Array.from(this.taskIndex.values());
      
      if (tasks.length <= maxHistory) {
        return 0; // 不需要清理
      }
      
      // 按创建时间排序，保留最新的任务
      const sortedTasks = tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const tasksToDelete = sortedTasks.slice(maxHistory);
      
      let deletedCount = 0;
      for (const task of tasksToDelete) {
        try {
          await this.deleteTask(task.taskId);
          deletedCount++;
        } catch (error) {
          this.logger.warn('Failed to delete task during cleanup', {
            taskId: task.taskId,
            error
          });
        }
      }
      
      return deletedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup tasks', { error });
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      this.stopCleanup();
      await this.saveIndex();
      this.logger.info('File task storage closed');
    } catch (error) {
      this.logger.error('Failed to close file task storage', { error });
      throw error;
    }
  }

  /**
   * 加载任务索引
   */
  private async loadIndex(): Promise<void> {
    try {
      if (!fs.existsSync(this.indexFile)) {
        this.taskIndex.clear();
        return;
      }
      
      const indexData = fs.readFileSync(this.indexFile, 'utf-8');
      const indexArray = JSON.parse(indexData) as StoredTask[];
      
      this.taskIndex.clear();
      for (const task of indexArray) {
        // 转换日期字段
        task.createdAt = new Date(task.createdAt);
        task.updatedAt = new Date(task.updatedAt);
        if (task.completedAt) {
          task.completedAt = new Date(task.completedAt);
        }
        
        this.taskIndex.set(task.taskId, task);
      }
    } catch (error) {
      this.logger.warn('Failed to load task index, starting with empty index', { error });
      this.taskIndex.clear();
    }
  }

  /**
   * 保存任务索引
   */
  private async saveIndex(): Promise<void> {
    try {
      const indexArray = Array.from(this.taskIndex.values());
      fs.writeFileSync(this.indexFile, JSON.stringify(indexArray, null, 2), 'utf-8');
    } catch (error) {
      this.logger.error('Failed to save task index', { error });
      throw error;
    }
  }

  /**
   * 计算目录大小
   */
  private getDirectorySize(dirPath: string): number {
    let totalSize = 0;
    
    try {
      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
          totalSize += this.getDirectorySize(filePath);
        } else {
          totalSize += stats.size;
        }
      }
    } catch (error) {
      // 忽略错误，返回当前计算的大小
    }
    
    return totalSize;
  }
}

/**
 * 创建任务存储实例
 */
export function createTaskStorage(options: TaskStorageOptions = {}, logger: Logger): TaskStorage {
  const storageType = options.storageType || 'file';
  switch (storageType) {
    case 'file':
      return new FileTaskStorage(options, logger);
    case 'redis':
      // TODO: 实现 Redis 存储
      throw new Error('Redis storage not implemented yet');
    case 'mongodb':
      // TODO: 实现 MongoDB 存储
      throw new Error('MongoDB storage not implemented yet');
    default:
      throw new Error(`Unsupported storage type: ${storageType}`);
  }
}