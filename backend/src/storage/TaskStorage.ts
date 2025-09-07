import { Task, TaskMetadata, TaskStatus, ClineMessage, TodoItem } from '@/types';
import { Logger } from 'winston';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { createClient, RedisClientType } from 'redis';
import { MongoClient, Db, Collection } from 'mongodb';

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
  // 添加完整的执行历史
  apiConversationHistory?: any[];
  toolExecutionHistory?: any[];
  executionEvents?: any[];
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
 * Redis-based task storage implementation
 */
export class RedisTaskStorage extends TaskStorage {
  private client: RedisClientType;
  private isConnected: boolean = false;
  private readonly keyPrefix: string = 'micro-butler:task:';
  private readonly indexKey: string = 'micro-butler:task:index';

  constructor(options: TaskStorageOptions = {}, logger: Logger) {
    super(options, logger);
    
    const connectionString = options.connectionString || 'redis://localhost:6379';
    this.client = createClient({ url: connectionString });
    
    this.client.on('error', (err) => {
      this.logger.error('Redis client error:', err);
    });
    
    this.client.on('connect', () => {
      this.logger.info('Connected to Redis');
      this.isConnected = true;
    });
    
    this.client.on('disconnect', () => {
      this.logger.warn('Disconnected from Redis');
      this.isConnected = false;
    });
  }

  async initialize(): Promise<void> {
    try {
      await this.client.connect();
      this.logger.info('Redis task storage initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Redis task storage:', error);
      throw error;
    }
  }

  async saveTask(task: StoredTask): Promise<void> {
    try {
      const taskKey = `${this.keyPrefix}${task.taskId}`;
      const taskData = JSON.stringify(task);
      
      await this.client.hSet(taskKey, {
        data: taskData,
        status: task.status,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString()
      });
      
      // Add to index
      await this.client.sAdd(this.indexKey, task.taskId);
      
      this.emit('taskSaved', { taskId: task.taskId });
      this.logger.debug('Task saved to Redis', { taskId: task.taskId });
    } catch (error) {
      this.logger.error('Failed to save task to Redis', { taskId: task.taskId, error });
      throw error;
    }
  }

  async getTask(taskId: string): Promise<StoredTask | null> {
    try {
      const taskKey = `${this.keyPrefix}${taskId}`;
      const taskData = await this.client.hGet(taskKey, 'data');
      
      if (!taskData) {
        return null;
      }
      
      const task = JSON.parse(taskData) as StoredTask;
      // Convert date strings back to Date objects
      task.createdAt = new Date(task.createdAt);
      task.updatedAt = new Date(task.updatedAt);
      if (task.completedAt) {
        task.completedAt = new Date(task.completedAt);
      }
      
      return task;
    } catch (error) {
      this.logger.error('Failed to get task from Redis', { taskId, error });
      return null;
    }
  }

  async updateTaskStatus(taskId: string, status: TaskStatus, error?: string): Promise<void> {
    try {
      const task = await this.getTask(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
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
      this.emit('taskStatusUpdated', { taskId, status });
    } catch (err) {
      this.logger.error('Failed to update task status in Redis', { taskId, status, error: err });
      throw err;
    }
  }

  async updateTaskMessages(taskId: string, messages: ClineMessage[]): Promise<void> {
    try {
      const task = await this.getTask(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }
      
      task.messages = messages;
      task.updatedAt = new Date();
      
      await this.saveTask(task);
      this.emit('taskMessagesUpdated', { taskId, messageCount: messages.length });
    } catch (error) {
      this.logger.error('Failed to update task messages in Redis', { taskId, error });
      throw error;
    }
  }

  async updateTaskTodos(taskId: string, todos: TodoItem[]): Promise<void> {
    try {
      const task = await this.getTask(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }
      
      task.todos = todos;
      task.updatedAt = new Date();
      
      await this.saveTask(task);
      this.emit('taskTodosUpdated', { taskId, todoCount: todos.length });
    } catch (error) {
      this.logger.error('Failed to update task todos in Redis', { taskId, error });
      throw error;
    }
  }

  async queryTasks(query: TaskQuery): Promise<StoredTask[]> {
    try {
      const taskIds = await this.client.sMembers(this.indexKey);
      const tasks: StoredTask[] = [];
      
      for (const taskId of taskIds) {
        const task = await this.getTask(taskId);
        if (task && this.matchesQuery(task, query)) {
          tasks.push(task);
        }
      }
      
      // Sort by creation date (newest first)
      tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      
      // Apply pagination
      const offset = query.offset || 0;
      const limit = query.limit || 50;
      
      return tasks.slice(offset, offset + limit);
    } catch (error) {
      this.logger.error('Failed to query tasks from Redis', { query, error });
      return [];
    }
  }

  async deleteTask(taskId: string): Promise<void> {
    try {
      const taskKey = `${this.keyPrefix}${taskId}`;
      
      await this.client.del(taskKey);
      await this.client.sRem(this.indexKey, taskId);
      
      this.emit('taskDeleted', { taskId });
      this.logger.debug('Task deleted from Redis', { taskId });
    } catch (error) {
      this.logger.error('Failed to delete task from Redis', { taskId, error });
      throw error;
    }
  }

  async getStats(): Promise<TaskStorageStats> {
    try {
      const taskIds = await this.client.sMembers(this.indexKey);
      const tasksByStatus: Record<TaskStatus, number> = {
        'created': 0,
        'pending': 0,
        'running': 0,
        'paused': 0,
        'completed': 0,
        'failed': 0,
        'aborted': 0
      };
      
      let oldestTask: Date | undefined;
      let newestTask: Date | undefined;
      
      for (const taskId of taskIds) {
        const taskKey = `${this.keyPrefix}${taskId}`;
        const status = await this.client.hGet(taskKey, 'status') as TaskStatus;
        const createdAt = await this.client.hGet(taskKey, 'createdAt');
        
        if (status) {
          tasksByStatus[status]++;
        }
        
        if (createdAt) {
          const date = new Date(createdAt);
          if (!oldestTask || date < oldestTask) {
            oldestTask = date;
          }
          if (!newestTask || date > newestTask) {
            newestTask = date;
          }
        }
      }
      
      return {
        totalTasks: taskIds.length,
        tasksByStatus,
        ...(oldestTask && { oldestTask }),
        ...(newestTask && { newestTask }),
        storageSize: 0 // Redis doesn't provide easy way to get storage size
      };
    } catch (error) {
      this.logger.error('Failed to get stats from Redis', { error });
      throw error;
    }
  }

  async cleanup(): Promise<number> {
    try {
      const maxAge = this.options.maxTaskHistory || 30; // days
      const cutoffDate = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000);
      
      const taskIds = await this.client.sMembers(this.indexKey);
      let deletedCount = 0;
      
      for (const taskId of taskIds) {
        const taskKey = `${this.keyPrefix}${taskId}`;
        const createdAtStr = await this.client.hGet(taskKey, 'createdAt');
        
        if (createdAtStr) {
          const createdAt = new Date(createdAtStr);
          if (createdAt < cutoffDate) {
            await this.deleteTask(taskId);
            deletedCount++;
          }
        }
      }
      
      this.logger.info(`Cleaned up ${deletedCount} old tasks from Redis`);
      return deletedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup Redis storage', { error });
      return 0;
    }
  }

  async close(): Promise<void> {
    try {
      this.stopCleanup();
      if (this.isConnected) {
        await this.client.quit();
      }
      this.logger.info('Redis task storage closed');
    } catch (error) {
      this.logger.error('Failed to close Redis task storage', { error });
    }
  }

  private matchesQuery(task: StoredTask, query: TaskQuery): boolean {
    if (query.status && task.status !== query.status) {
      return false;
    }
    
    if (query.createdAfter && task.createdAt < query.createdAfter) {
      return false;
    }
    
    if (query.createdBefore && task.createdAt > query.createdBefore) {
      return false;
    }
    
    return true;
  }
}

/**
 * MongoDB-based task storage implementation
 */
export class MongoTaskStorage extends TaskStorage {
  private client: MongoClient;
  private db!: Db;
  private collection!: Collection<StoredTask>;
  private isConnected: boolean = false;
  private readonly dbName: string = 'micro-butler';
  private readonly collectionName: string = 'tasks';

  constructor(options: TaskStorageOptions = {}, logger: Logger) {
    super(options, logger);
    
    const connectionString = options.connectionString || 'mongodb://localhost:27017';
    this.client = new MongoClient(connectionString);
  }

  async initialize(): Promise<void> {
    try {
      await this.client.connect();
      this.db = this.client.db(this.dbName);
      this.collection = this.db.collection<StoredTask>(this.collectionName);
      
      // Create indexes for better performance
      await this.collection.createIndex({ taskId: 1 }, { unique: true });
      await this.collection.createIndex({ status: 1 });
      await this.collection.createIndex({ createdAt: 1 });
      
      this.isConnected = true;
      this.logger.info('MongoDB task storage initialized');
    } catch (error) {
      this.logger.error('Failed to initialize MongoDB task storage:', error);
      throw error;
    }
  }

  async saveTask(task: StoredTask): Promise<void> {
    try {
      await this.collection.replaceOne(
        { taskId: task.taskId },
        task,
        { upsert: true }
      );
      
      this.emit('taskSaved', { taskId: task.taskId });
      this.logger.debug('Task saved to MongoDB', { taskId: task.taskId });
    } catch (error) {
      this.logger.error('Failed to save task to MongoDB', { taskId: task.taskId, error });
      throw error;
    }
  }

  async getTask(taskId: string): Promise<StoredTask | null> {
    try {
      const task = await this.collection.findOne({ taskId });
      return task || null;
    } catch (error) {
      this.logger.error('Failed to get task from MongoDB', { taskId, error });
      return null;
    }
  }

  async updateTaskStatus(taskId: string, status: TaskStatus, error?: string): Promise<void> {
    try {
      const updateDoc: any = {
        status,
        updatedAt: new Date()
      };
      
      if (error) {
        updateDoc.error = error;
      }
      
      if (status === 'completed' || status === 'failed' || status === 'aborted') {
        updateDoc.completedAt = new Date();
      }
      
      const result = await this.collection.updateOne(
        { taskId },
        { $set: updateDoc }
      );
      
      if (result.matchedCount === 0) {
        throw new Error(`Task not found: ${taskId}`);
      }
      
      this.emit('taskStatusUpdated', { taskId, status });
    } catch (err) {
      this.logger.error('Failed to update task status in MongoDB', { taskId, status, error: err });
      throw err;
    }
  }

  async updateTaskMessages(taskId: string, messages: ClineMessage[]): Promise<void> {
    try {
      const result = await this.collection.updateOne(
        { taskId },
        { 
          $set: { 
            messages,
            updatedAt: new Date()
          }
        }
      );
      
      if (result.matchedCount === 0) {
        throw new Error(`Task not found: ${taskId}`);
      }
      
      this.emit('taskMessagesUpdated', { taskId, messageCount: messages.length });
    } catch (error) {
      this.logger.error('Failed to update task messages in MongoDB', { taskId, error });
      throw error;
    }
  }

  async updateTaskTodos(taskId: string, todos: TodoItem[]): Promise<void> {
    try {
      const result = await this.collection.updateOne(
        { taskId },
        { 
          $set: { 
            todos,
            updatedAt: new Date()
          }
        }
      );
      
      if (result.matchedCount === 0) {
        throw new Error(`Task not found: ${taskId}`);
      }
      
      this.emit('taskTodosUpdated', { taskId, todoCount: todos.length });
    } catch (error) {
      this.logger.error('Failed to update task todos in MongoDB', { taskId, error });
      throw error;
    }
  }

  async queryTasks(query: TaskQuery): Promise<StoredTask[]> {
    try {
      const filter: any = {};
      
      if (query.status) {
        filter.status = query.status;
      }
      
      if (query.createdAfter) {
        filter.createdAt = { $gte: query.createdAfter };
      }
      
      if (query.createdBefore) {
        if (filter.createdAt) {
          filter.createdAt.$lte = query.createdBefore;
        } else {
          filter.createdAt = { $lte: query.createdBefore };
        }
      }
      
      const cursor = this.collection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(query.offset || 0)
        .limit(query.limit || 50);
      
      return await cursor.toArray();
    } catch (error) {
      this.logger.error('Failed to query tasks from MongoDB', { query, error });
      return [];
    }
  }

  async deleteTask(taskId: string): Promise<void> {
    try {
      const result = await this.collection.deleteOne({ taskId });
      
      if (result.deletedCount === 0) {
        throw new Error(`Task not found: ${taskId}`);
      }
      
      this.emit('taskDeleted', { taskId });
      this.logger.debug('Task deleted from MongoDB', { taskId });
    } catch (error) {
      this.logger.error('Failed to delete task from MongoDB', { taskId, error });
      throw error;
    }
  }

  async getStats(): Promise<TaskStorageStats> {
    try {
      const totalTasks = await this.collection.countDocuments();
      
      // Get task counts by status
      const statusCounts = await this.collection.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]).toArray();
      
      const tasksByStatus: Record<TaskStatus, number> = {
        'created': 0,
        'pending': 0,
        'running': 0,
        'paused': 0,
        'completed': 0,
        'failed': 0,
        'aborted': 0
      };
      
      statusCounts.forEach(item => {
        if (item._id in tasksByStatus) {
          tasksByStatus[item._id as TaskStatus] = item.count;
        }
      });
      
      // Get oldest and newest tasks
      const oldestTask = await this.collection.findOne({}, { sort: { createdAt: 1 } });
      const newestTask = await this.collection.findOne({}, { sort: { createdAt: -1 } });
      
      // Get approximate storage size (this is a rough estimate)
      const stats = await this.db.stats();
      
      return {
        totalTasks,
        tasksByStatus,
        ...(oldestTask && { oldestTask: oldestTask.createdAt }),
        ...(newestTask && { newestTask: newestTask.createdAt }),
        storageSize: stats.dataSize || 0
      };
    } catch (error) {
      this.logger.error('Failed to get stats from MongoDB', { error });
      throw error;
    }
  }

  async cleanup(): Promise<number> {
    try {
      const maxAge = this.options.maxTaskHistory || 30; // days
      const cutoffDate = new Date(Date.now() - maxAge * 24 * 60 * 60 * 1000);
      
      const result = await this.collection.deleteMany({
        createdAt: { $lt: cutoffDate }
      });
      
      this.logger.info(`Cleaned up ${result.deletedCount} old tasks from MongoDB`);
      return result.deletedCount || 0;
    } catch (error) {
      this.logger.error('Failed to cleanup MongoDB storage', { error });
      return 0;
    }
  }

  async close(): Promise<void> {
    try {
      this.stopCleanup();
      if (this.isConnected) {
        await this.client.close();
        this.isConnected = false;
      }
      this.logger.info('MongoDB task storage closed');
    } catch (error) {
      this.logger.error('Failed to close MongoDB task storage', { error });
    }
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
      return new RedisTaskStorage(options, logger);
    case 'mongodb':
      return new MongoTaskStorage(options, logger);
    default:
      throw new Error(`Unsupported storage type: ${storageType}`);
  }
}