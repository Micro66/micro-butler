import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { WebSocketMessage, TaskStatusUpdate } from '@/types';
import { AppLogger } from '@/utils/Logger';
import { EventEmitter } from 'node:events';

export interface WebSocketOptions {
  logger: AppLogger;
  taskManager: import('@/core/task/TaskManager').TaskManager;
}

export class TaskWebSocket extends EventEmitter {
  private io: SocketIOServer;
  private logger: AppLogger;
  private taskManager: import('@/core/task/TaskManager').TaskManager;
  private connectedClients: Map<string, Socket> = new Map();
  private taskSubscriptions: Map<string, Set<string>> = new Map(); // taskId -> Set<socketId>

  constructor(server: HttpServer, options: WebSocketOptions) {
    super();
    
    this.logger = options.logger;
    this.taskManager = options.taskManager;
    
    this.io = new SocketIOServer(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      transports: ['websocket', 'polling']
    });
    
    this.setupEventHandlers();
    this.setupTaskManagerListeners();
  }

  /**
   * Setup event handlers for Socket.IO
   */
  private setupEventHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      this.handleConnection(socket);
    });
  }

  /**
   * Handle client connection
   */
  public handleConnection(socket: Socket): void {
    this.logger.info(`Client connected: ${socket.id}`);
    this.connectedClients.set(socket.id, socket);
      
    // 发送连接确认
    socket.emit('connected', {
      message: 'Connected to task websocket server',
      timestamp: new Date().toISOString()
    });

    this.setupSocketHandlers(socket);
  }

  /**
   * Setup socket event handlers
   */
  private setupSocketHandlers(socket: Socket): void {
    // Handle task subscription
    socket.on('subscribe', (data: { taskId: string }) => {
      this.subscribeToTask(socket.id, data.taskId);
    });

    // Handle task unsubscription
    socket.on('unsubscribe', (data: { taskId: string }) => {
      this.unsubscribeFromTask(socket.id, data.taskId);
    });

    // Handle get task status
    socket.on('getTaskStatus', async (data: { taskId: string }) => {
      await this.getTaskStatus(socket, data.taskId);
    });

    // Handle get task messages
    socket.on('getTaskMessages', async (data: { taskId: string, offset?: number, limit?: number }) => {
      await this.getTaskMessages(socket, data.taskId, data.offset, data.limit);
    });

    // Handle create task
    socket.on('create_task', async (data: { description: string }) => {
      await this.handleCreateTask(socket, data.description);
    });

    // Handle execute tool
    socket.on('execute_tool', async (data: { taskId: string, toolName: string, parameters: any }) => {
      await this.handleExecuteTool(socket, data.taskId, data.toolName, data.parameters);
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      this.handleDisconnect(socket);
    });

    // Handle errors
    socket.on('error', (error: Error) => {
      this.handleError(socket, error);
    });
  }

  /**
   * Handle create task request
   */
  private async handleCreateTask(socket: Socket, description: string): Promise<void> {
    try {
      const taskId = await this.taskManager.createTask({ task: description });
      const task = await this.taskManager.getTask(taskId);
      
      socket.emit('task_created', {
        taskId,
        description: task?.metadata.task || description,
        status: task?.getStatus() || 'pending',
        timestamp: new Date().toISOString()
      });
      
      // Auto-subscribe to the created task
      this.subscribeToTask(socket.id, taskId);
      
      this.logger.info(`Task created via WebSocket: ${taskId}`);
    } catch (error) {
      this.logger.error('Failed to create task via WebSocket', { error, description });
      socket.emit('error', {
        message: 'Failed to create task',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle execute tool request
   */
  private async handleExecuteTool(socket: Socket, taskId: string, toolName: string, parameters: any): Promise<void> {
    try {
      const task = await this.taskManager.getTask(taskId);
      if (!task) {
        socket.emit('error', {
          message: `Task ${taskId} not found`,
          timestamp: new Date().toISOString()
        });
        return;
      }

      // For now, we'll start the task with the tool execution request as a message
      // This is a simplified approach - in a full implementation, you might want to
      // expose the toolExecutor or create a specific method for tool execution
      const toolMessage = `Execute tool: ${toolName} with parameters: ${JSON.stringify(parameters)}`;
      await task.startTask(toolMessage);
      
      socket.emit('tool_executed', {
        taskId,
        toolName,
        parameters,
        result: 'Tool execution started',
        timestamp: new Date().toISOString()
      });
      
      this.logger.info(`Tool execution started via WebSocket: ${toolName} for task ${taskId}`);
    } catch (error) {
      this.logger.error('Failed to execute tool via WebSocket', { error, taskId, toolName });
      socket.emit('error', {
        message: 'Failed to execute tool',
        error: error instanceof Error ? error.message : 'Unknown error',
        taskId,
        toolName,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get task status and send to client
   */
  private async getTaskStatus(socket: Socket, taskId: string): Promise<void> {
    try {
      const task = await this.taskManager.getTask(taskId);
      if (task) {
        socket.emit('task_status', {
          taskId,
          status: task.getStatus(),
          timestamp: new Date().toISOString()
        });
      } else {
        socket.emit('error', {
          message: `Task ${taskId} not found`,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      this.logger.error('Failed to get task status', { error, taskId });
      socket.emit('error', {
        message: 'Failed to get task status',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get task messages and send to client
   */
  private async getTaskMessages(socket: Socket, taskId: string, offset?: number, limit?: number): Promise<void> {
    try {
      const task = await this.taskManager.getTask(taskId);
      if (task) {
        const messages = task.getMessages();
        const start = offset || 0;
        const end = limit ? start + limit : messages.length;
        socket.emit('task_messages', {
          taskId,
          messages: messages.slice(start, end),
          total: messages.length,
          timestamp: new Date().toISOString()
        });
      } else {
        socket.emit('error', {
          message: `Task ${taskId} not found`,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      this.logger.error('Failed to get task messages', { error, taskId });
      socket.emit('error', {
        message: 'Failed to get task messages',
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(socket: Socket): void {
    this.logger.info(`Client disconnected: ${socket.id}`);
    this.handleClientDisconnect(socket.id);
  }

  /**
   * Handle socket errors
   */
  private handleError(socket: Socket, error: Error): void {
    this.logger.error(`Socket error for client ${socket.id}:`, error);
  }

  /**
   * 设置任务管理器事件监听器
   */
  private setupTaskManagerListeners(): void {
    // 监听任务状态更新
    this.taskManager.on('taskStatusUpdate', (update: TaskStatusUpdate) => {
      this.broadcastTaskUpdate(update);
    });

    // 监听任务消息更新
    this.taskManager.on('taskMessageUpdate', (data: { taskId: string; message: any }) => {
      this.broadcastToTaskSubscribers(data.taskId, 'task_message', {
        taskId: data.taskId,
        message: data.message,
        timestamp: new Date().toISOString()
      });
    });

    // 监听任务完成
    this.taskManager.on('taskCompleted', (data: { taskId: string; result: any }) => {
      this.broadcastToTaskSubscribers(data.taskId, 'task_completed', {
        taskId: data.taskId,
        result: data.result,
        timestamp: new Date().toISOString()
      });
    });

    // 监听任务错误
    this.taskManager.on('taskError', (data: { taskId: string; error: any }) => {
      this.broadcastToTaskSubscribers(data.taskId, 'task_error', {
        taskId: data.taskId,
        error: data.error,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * 订阅任务更新
   */
  private subscribeToTask(socketId: string, taskId: string): void {
    if (!this.taskSubscriptions.has(taskId)) {
      this.taskSubscriptions.set(taskId, new Set());
    }
    this.taskSubscriptions.get(taskId)!.add(socketId);
  }

  /**
   * 取消订阅任务更新
   */
  private unsubscribeFromTask(socketId: string, taskId: string): void {
    const subscribers = this.taskSubscriptions.get(taskId);
    if (subscribers) {
      subscribers.delete(socketId);
      if (subscribers.size === 0) {
        this.taskSubscriptions.delete(taskId);
      }
    }
  }

  /**
   * 处理客户端断开连接
   */
  private handleClientDisconnect(socketId: string): void {
    // 从所有任务订阅中移除该客户端
    for (const [taskId, subscribers] of this.taskSubscriptions.entries()) {
      subscribers.delete(socketId);
      if (subscribers.size === 0) {
        this.taskSubscriptions.delete(taskId);
      }
    }
    
    // 从连接的客户端列表中移除
    this.connectedClients.delete(socketId);
  }

  /**
   * 广播任务状态更新
   */
  private broadcastTaskUpdate(update: TaskStatusUpdate): void {
    this.broadcastToTaskSubscribers(update.taskId, 'task_status_update', {
      ...update,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 向任务订阅者广播消息
   */
  private broadcastToTaskSubscribers(taskId: string, event: string, data: any): void {
    const subscribers = this.taskSubscriptions.get(taskId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    for (const socketId of subscribers) {
      const socket = this.connectedClients.get(socketId);
      if (socket) {
        socket.emit(event, data);
      }
    }

    this.logger.debug(`Broadcasted ${event} to ${subscribers.size} subscribers for task ${taskId}`);
  }

  /**
   * 向所有连接的客户端广播消息
   */
  public broadcastToAll(event: string, data: any): void {
    this.io.emit(event, {
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 向特定客户端发送消息
   */
  public sendToClient(socketId: string, event: string, data: any): void {
    const socket = this.connectedClients.get(socketId);
    if (socket) {
      socket.emit(event, {
        ...data,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * 获取连接统计信息
   */
  public getConnectionStats(): {
    connectedClients: number;
    taskSubscriptions: number;
    totalSubscriptions: number;
  } {
    let totalSubscriptions = 0;
    for (const subscribers of this.taskSubscriptions.values()) {
      totalSubscriptions += subscribers.size;
    }

    return {
      connectedClients: this.connectedClients.size,
      taskSubscriptions: this.taskSubscriptions.size,
      totalSubscriptions
    };
  }

  /**
   * 关闭 WebSocket 服务器
   */
  public close(): Promise<void> {
    return new Promise((resolve) => {
      this.io.close(() => {
        this.logger.info('WebSocket server closed');
        resolve();
      });
    });
  }
}