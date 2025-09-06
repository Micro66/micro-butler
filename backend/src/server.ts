import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { ConfigManager } from '@/config/ConfigManager';
import { initializeLogging, getLogger } from '@/utils/Logger';
import { createTaskStorage } from '@/storage/TaskStorage';
import { TaskWebSocket } from '@/api/websocket/TaskWebSocket';
import { Task } from '@/core/task/Task';
import { TaskManager } from '@/core/task/TaskManager';
import { taskRoutes } from '@/api/routes/tasks';
import { configRoutes } from '@/api/routes/config';
import { AppConfig, CreateTaskRequest, CreateTaskResponse, GetTaskResponse, ListTasksResponse, TaskStatus } from '@/types';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/**
 * 应用服务器类
 */
export class AppServer {
  private app: FastifyInstance;
  private config: AppConfig;
  private configManager: ConfigManager;
  private taskStorage: any;
  private taskManager: TaskManager;
  private taskWebSocket: TaskWebSocket | null = null;
  private logger = getLogger('server');

  constructor(configPath?: string) {
    // 初始化配置管理器
    this.configManager = new ConfigManager(configPath);
    this.config = this.configManager.getConfig();
    
    // 初始化日志系统
    initializeLogging(this.config.logging);
    
    // 创建 Fastify 实例
    this.app = Fastify({
      logger: false, // 使用自定义日志器
      trustProxy: true
    });
    
    // 初始化存储
    this.taskStorage = createTaskStorage({
      storageType: this.config.storage.type || 'file',
      storagePath: this.config.storage.path || './data',
      maxTaskHistory: this.config.storage.maxTaskHistory || 1000,
      cleanupInterval: this.config.storage.cleanupInterval || 3600000
    }, this.logger as any);
    
    // 初始化任务管理器
    this.taskManager = new TaskManager(this.logger as any, this.taskStorage, this.configManager);
    
    // 初始化 WebSocket
    this.taskWebSocket = new TaskWebSocket(this.app.server, {
      logger: this.logger,
      taskManager: this.taskManager
    });

    this.logger.info('WebSocket server initialized');
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupErrorHandling();
  }

  /**
   * 设置中间件
   */
  private setupMiddleware(): void {
    // CORS 支持
    this.app.register(cors, {
      origin: this.config.server.cors?.origins || '*',
      methods: this.config.server.cors?.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: this.config.server.cors?.allowedHeaders || ['Content-Type', 'Authorization']
    });

    // WebSocket 支持
    this.app.register(websocket);

    // 请求日志中间件
    this.app.addHook('onRequest', async (request, reply) => {
      (request as any).startTime = Date.now();
    });

    this.app.addHook('onResponse', async (request, reply) => {
      const duration = Date.now() - ((request as any).startTime || Date.now());
      this.logger.http(
        request.method,
        request.url,
        reply.statusCode,
        duration,
        {
          userAgent: request.headers['user-agent'],
          ip: request.ip
        }
      );
    });
  }

  /**
   * 设置路由
   */
  private setupRoutes(): void {
    // 健康检查
    this.app.get('/health', async (request, reply) => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0'
      };
    });

    // 注册任务路由
    this.app.register(taskRoutes, {
      prefix: '/api',
      logger: this.logger as any,
      taskManager: this.taskManager
    });

    // 注册配置路由
    this.app.register(configRoutes, {
      prefix: '/api',
      logger: this.logger as any,
      configManager: this.configManager
    });

    // 所有任务相关的路由现在通过 taskRoutes 处理
  }

  /**
   * 设置 WebSocket
   */
  private setupWebSocket(): void {
    this.app.register(async (fastify) => {
      fastify.get('/ws', { websocket: true }, (connection, request) => {
        this.taskWebSocket?.handleConnection(connection.socket);
      });
    });
  }

  /**
   * 设置错误处理
   */
  private setupErrorHandling(): void {
    // 全局错误处理
    this.app.setErrorHandler((error, request, reply) => {
      this.logger.error('Unhandled error', error, {
        url: request.url,
        method: request.method
      });

      reply.code(500).send({
        error: 'Internal server error'
      });
    });

    // 404 处理
    this.app.setNotFoundHandler((request, reply) => {
      reply.code(404).send({
        error: 'Not found',
        path: request.url
      });
    });
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    try {
      // 初始化存储
      await this.taskStorage.initialize();
      
      // 启动服务器
      const address = await this.app.listen({
        port: this.config.server.port || 3000,
        host: this.config.server.host || '0.0.0.0'
      });

      this.logger.info('Server started', {
        address,
        port: this.config.server.port,
        host: this.config.server.host
      });

      // 监听配置变化
      this.configManager.watchConfig((newConfig) => {
        this.logger.info('Configuration updated', { newConfig });
        // 这里可以添加热重载逻辑
      });

    } catch (error) {
      this.logger.error('Failed to start server', error as Error);
      throw error;
    }
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    try {
      this.logger.info('Stopping server...');
      
      // 停止所有运行中的任务
      await this.taskManager.cleanup();
      this.logger.info('All tasks cleaned up during shutdown');
      
      // 关闭存储
      await this.taskStorage.close();
      
      // 停止配置监听
      this.configManager.unwatchConfig();
      
      // 关闭服务器
      await this.app.close();
      
      this.logger.info('Server stopped');
    } catch (error) {
      this.logger.error('Failed to stop server gracefully', error as Error);
      throw error;
    }
  }

  /**
   * 获取服务器实例
   */
  getApp(): FastifyInstance {
    return this.app;
  }
}

/**
 * 启动应用
 */
export async function startApp(configPath?: string): Promise<AppServer> {
  const server = new AppServer(configPath);
  await server.start();
  return server;
}

/**
 * 优雅关闭处理
 */
function setupGracefulShutdown(server: AppServer): void {
  const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
  
  signals.forEach((signal) => {
    process.on(signal, async () => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      try {
        await server.stop();
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    });
  });
}

// 如果直接运行此文件，启动服务器
if (require.main === module) {
  (async () => {
    try {
      const configPath = process.env.CONFIG_PATH;
      const server = await startApp(configPath);
      setupGracefulShutdown(server);
    } catch (error) {
      console.error('Failed to start application:', error);
      process.exit(1);
    }
  })();
}