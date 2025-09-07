import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CreateTaskRequest, CreateTaskResponse, GetTaskResponse, ListTasksResponse, StartTaskRequest, StartTaskResponse } from '@/types';
import { Task } from '@/core/task/Task';
import { TaskManager } from '@/core/task/TaskManager';
import { Logger } from 'winston';

export interface TaskRouteOptions {
  logger: Logger;
  taskManager: TaskManager;
}

export async function taskRoutes(
  fastify: FastifyInstance,
  options: TaskRouteOptions
): Promise<void> {
  const { logger, taskManager } = options;

  // 创建任务
  fastify.post<{
    Body: CreateTaskRequest;
    Reply: CreateTaskResponse;
  }>('/tasks', {
    schema: {
      body: {
        type: 'object',
        required: ['task'],
        properties: {
          task: { type: 'string' },
          images: {
            type: 'array',
            items: { type: 'string' }
          },
          workspacePath: { type: 'string' },
          apiConfiguration: {
            type: 'object',
            properties: {
              provider: { type: 'string' },
              apiKey: { type: 'string' },
              model: { type: 'string' },
              baseUrl: { type: 'string' },
              maxTokens: { type: 'number' },
              temperature: { type: 'number' }
            }
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            taskId: { type: 'string' },
            status: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CreateTaskRequest }>, reply: FastifyReply) => {
    try {
      const { task, images, workspacePath, apiConfiguration } = request.body;
      
      logger.info('Creating new task', { task: task.substring(0, 100) });
      
      const createTaskRequest: any = {
        task: request.body.task,
        images: images || [],
        workspacePath: workspacePath || process.cwd()
      };
      
      // 只在有值时才添加apiConfiguration
      if (apiConfiguration) {
        createTaskRequest.apiConfiguration = apiConfiguration;
      }
      
      const taskId = await taskManager.createTask(createTaskRequest);
      
      const response: CreateTaskResponse = {
        taskId,
        status: 'created',
        message: 'Task created successfully',
        createdAt: new Date()
      };
      
      reply.code(200).send(response);
    } catch (error) {
      logger.error('Failed to create task', { error });
      reply.code(500).send({
        error: 'Failed to create task',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 获取任务详情
  fastify.get<{
    Params: { taskId: string };
    Reply: GetTaskResponse;
  }>('/tasks/:taskId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          taskId: { type: 'string' }
        },
        required: ['taskId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            taskId: { type: 'string' },
            status: { type: 'string' },
            metadata: { type: 'object' },
            messages: { type: 'array' },
            todos: { type: 'array' },
            createdAt: { type: 'string' },
            updatedAt: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
    try {
      const { taskId } = request.params;
      
      // 直接从存储获取任务数据，确保状态是最新的
      const storedTask = await taskManager.getStoredTask(taskId);
      if (!storedTask) {
        reply.code(404).send({
          error: 'Task not found',
          message: `Task with ID ${taskId} does not exist`
        });
        return;
      }
      
      const response: GetTaskResponse = {
        taskId: storedTask.taskId,
        status: storedTask.status,
        metadata: storedTask.metadata,
        messages: storedTask.messages,
        todos: storedTask.todos,
        createdAt: storedTask.createdAt.getTime(),
        updatedAt: storedTask.updatedAt.getTime()
      };
      
      reply.code(200).send(response);
    } catch (error) {
      logger.error('Failed to get task', { error, taskId: request.params.taskId });
      reply.code(500).send({
        error: 'Failed to get task',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get task details - Supports direct return or stream return
  fastify.get<{
    Params: { taskId: string };
    Querystring: { stream?: boolean };
  }>('/tasks/:taskId/details', {
    schema: {
      params: {
        type: 'object',
        properties: {
          taskId: { type: 'string' }
        },
        required: ['taskId']
      },
      querystring: {
        type: 'object',
        properties: {
          stream: { type: 'boolean' }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { taskId: string }; Querystring: { stream?: boolean } }>, reply: FastifyReply) => {
    const { taskId } = request.params;
    const { stream = false } = request.query;
    
    try {
      // 检查任务是否存在
      const task = await taskManager.getTask(taskId);
      if (!task) {
        reply.code(404).send({
          error: 'Task not found',
          message: `Task with ID ${taskId} does not exist`
        });
        return;
      }

      if (stream) {
        // 流式返回模式
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control'
        });

        // 发送任务基本信息
        const storedTask = await taskManager.getStoredTask(taskId);
        if (storedTask) {
          reply.raw.write(`data: ${JSON.stringify({
            type: 'task_info',
            taskId: storedTask.taskId,
            status: storedTask.status,
            metadata: storedTask.metadata,
            createdAt: storedTask.createdAt.getTime(),
            updatedAt: storedTask.updatedAt.getTime(),
            timestamp: new Date().toISOString()
          })}\n\n`);
        }

        // 发送消息历史
        const messages = task.getMessages();
        if (messages && messages.length > 0) {
          for (const message of messages) {
            reply.raw.write(`data: ${JSON.stringify({
              type: 'message',
              taskId,
              message,
              timestamp: new Date().toISOString()
            })}\n\n`);
          }
        }

        // 发送TODO列表
        const todos = task.getTodos();
        if (todos && todos.length > 0) {
          reply.raw.write(`data: ${JSON.stringify({
            type: 'todos',
            taskId,
            todos,
            timestamp: new Date().toISOString()
          })}\n\n`);
        }

        // 发送API对话历史
         const apiHistory = storedTask?.apiConversationHistory || [];
         if (apiHistory && apiHistory.length > 0) {
           for (const apiMessage of apiHistory) {
             reply.raw.write(`data: ${JSON.stringify({
               type: 'api_history',
               taskId,
               apiMessage,
               timestamp: new Date().toISOString()
             })}\n\n`);
           }
         }

         // 监听实时事件（如果任务正在运行）
         // 优先使用存储中的状态，因为它更准确反映任务的最终状态
         const currentStatus = storedTask?.status || task.getStatus();
         if (currentStatus === 'running') {
          // 设置事件监听器
          const onTaskUpdate = (data: any) => {
            if (data.taskId === taskId) {
              reply.raw.write(`data: ${JSON.stringify({
                type: 'task_update',
                taskId,
                ...data,
                timestamp: new Date().toISOString()
              })}\n\n`);
            }
          };

          const onTaskMessage = (data: any) => {
            if (data.taskId === taskId) {
              reply.raw.write(`data: ${JSON.stringify({
                type: 'task_message',
                taskId,
                message: data.message,
                timestamp: new Date().toISOString()
              })}\n\n`);
            }
          };

          const onApiRequest = (data: any) => {
            if (data.taskId === taskId) {
              reply.raw.write(`data: ${JSON.stringify({
                type: 'api_request',
                taskId,
                request: data.request,
                model: data.model,
                timestamp: new Date().toISOString()
              })}\n\n`);
            }
          };

          const onApiResponse = (data: any) => {
            if (data.taskId === taskId) {
              reply.raw.write(`data: ${JSON.stringify({
                type: 'api_response',
                taskId,
                response: data.response,
                timestamp: new Date().toISOString()
              })}\n\n`);
            }
          };

          const onToolCall = (data: any) => {
            if (data.taskId === taskId) {
              reply.raw.write(`data: ${JSON.stringify({
                type: 'tool_call',
                taskId,
                toolCall: data.toolCall,
                timestamp: new Date().toISOString()
              })}\n\n`);
            }
          };

          const onToolResult = (data: any) => {
            if (data.taskId === taskId) {
              reply.raw.write(`data: ${JSON.stringify({
                type: 'tool_result',
                taskId,
                toolCall: data.toolCall,
                result: data.result,
                timestamp: new Date().toISOString()
              })}\n\n`);
            }
          };

          const onTaskCompleted = (data: any) => {
            if (data.taskId === taskId) {
              reply.raw.write(`data: ${JSON.stringify({
                type: 'task_completed',
                taskId,
                result: data.result,
                timestamp: new Date().toISOString()
              })}\n\n`);
              
              // 任务完成后立即关闭连接
              reply.raw.end();
            }
          };

          const onTaskError = (data: any) => {
            if (data.taskId === taskId) {
              reply.raw.write(`data: ${JSON.stringify({
                type: 'task_error',
                taskId,
                error: data.error,
                timestamp: new Date().toISOString()
              })}\n\n`);
            }
          };

          // 注册事件监听器
          taskManager.on('taskStatusUpdate', onTaskUpdate);
          taskManager.on('task:message', onTaskMessage);
          taskManager.on('task:apiRequest', onApiRequest);
          taskManager.on('task:apiResponse', onApiResponse);
          taskManager.on('task:completed', onTaskCompleted);
          taskManager.on('task:error', onTaskError);
          taskManager.on('task:tool:call', onToolCall);
          taskManager.on('task:tool:result', onToolResult);

          // 处理客户端断开连接
          request.raw.on('close', () => {
            logger.info(`SSE client disconnected for task ${taskId}`);
            taskManager.removeListener('taskStatusUpdate', onTaskUpdate);
            taskManager.removeListener('task:message', onTaskMessage);
            taskManager.removeListener('task:apiRequest', onApiRequest);
            taskManager.removeListener('task:apiResponse', onApiResponse);
            taskManager.removeListener('task:completed', onTaskCompleted);
            taskManager.removeListener('task:error', onTaskError);
            taskManager.removeListener('task:tool:call', onToolCall);
            taskManager.removeListener('task:tool:result', onToolResult);
          });

          // 发送心跳包
          const heartbeat = setInterval(() => {
            try {
              reply.raw.write(`data: ${JSON.stringify({
                type: 'heartbeat',
                taskId,
                timestamp: new Date().toISOString()
              })}\n\n`);
            } catch (error) {
              clearInterval(heartbeat);
            }
          }, 30000); // 每30秒发送一次心跳

          // 清理心跳定时器
          request.raw.on('close', () => {
            clearInterval(heartbeat);
          });
        } else {
          // 任务已完成或未运行，发送完成信号并关闭连接
          reply.raw.write(`data: ${JSON.stringify({
            type: 'stream_complete',
            taskId,
            status: currentStatus,
            message: 'Task details sent completely',
            timestamp: new Date().toISOString()
          })}\n\n`);
          
          // 立即关闭连接，不需要延迟
          reply.raw.end();
        }

        // 处理客户端断开连接的通用清理逻辑
        request.raw.on('close', () => {
          logger.info(`SSE client disconnected for task details ${taskId}`);
        });

        // 处理连接错误
        request.raw.on('error', (error) => {
          logger.error(`SSE connection error for task ${taskId}:`, error);
        });

        reply.raw.on('error', (error) => {
          logger.error(`SSE response error for task ${taskId}:`, error);
        });

        logger.info(`SSE client connected for task details ${taskId}`);
        
      } else {
        // 直接返回模式
        const storedTask = await taskManager.getStoredTask(taskId);
        if (!storedTask) {
          reply.code(404).send({
            error: 'Task not found',
            message: `Task with ID ${taskId} does not exist`
          });
          return;
        }

        const response = {
           taskId: storedTask.taskId,
           status: storedTask.status,
           metadata: storedTask.metadata,
           messages: storedTask.messages,
           todos: storedTask.todos,
           createdAt: storedTask.createdAt.getTime(),
           updatedAt: storedTask.updatedAt.getTime(),
           // 添加额外的详细信息
           currentStatus: task.getStatus(),
           isRunning: task.getStatus() === 'running',
           messageCount: storedTask.messages?.length || 0,
           todoCount: storedTask.todos?.length || 0,
           // 添加完整的执行历史
           apiConversationHistory: storedTask.apiConversationHistory || [],
           toolExecutionHistory: storedTask.toolExecutionHistory || [],
           executionEvents: storedTask.executionEvents || []
         };

        reply.code(200).send(response);
      }
      
    } catch (error) {
      logger.error('Failed to get task details', { error, taskId });
      if (stream) {
        reply.raw.write(`data: ${JSON.stringify({
          type: 'error',
          taskId,
          error: 'Failed to get task details',
          message: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        })}\n\n`);
        reply.raw.end();
      } else {
        reply.code(500).send({
          error: 'Failed to get task details',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  });

  // 获取任务统计
  fastify.get('/tasks/stats', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            running: { type: 'number' },
            completed: { type: 'number' },
            failed: { type: 'number' },
            paused: { type: 'number' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await taskManager.getTaskStats();
      reply.code(200).send(stats);
    } catch (error) {
      logger.error('Failed to get task stats', { error });
      reply.code(500).send({
        error: 'Failed to get task stats',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 获取任务列表
  fastify.get<{
    Querystring: {
      page?: number;
      limit?: number;
      status?: string;
    };
    Reply: ListTasksResponse;
  }>('/tasks', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'number', minimum: 1, default: 1 },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 10 },
          status: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            tasks: { type: 'array' },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                totalPages: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{
    Querystring: { page?: number; limit?: number; status?: string }
  }>, reply: FastifyReply) => {
    try {
      const { page = 1, limit = 10, status } = request.query;
      
      const listOptions: any = { page: page || 1, limit: limit || 10 };
      if (status) {
        listOptions.status = status;
      }
      
      const result = await taskManager.listTasks(listOptions);
      
      const response: ListTasksResponse = {
        tasks: result.tasks.map((task: any) => ({
          taskId: task.taskId,
          status: task.getStatus(),
          metadata: task.metadata,
          createdAt: task.metadata.createdAt,
          updatedAt: task.metadata.updatedAt
        })),
        total: result.total,
        page: page || 1,
        limit: limit || 10,
        pagination: {
          page: page || 1,
          limit: limit || 10,
          totalPages: Math.ceil(result.total / (limit || 10))
        }
      };
      
      reply.code(200).send(response);
    } catch (error) {
      logger.error('Failed to list tasks', { error });
      reply.code(500).send({
        error: 'Failed to list tasks',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 启动任务
  fastify.post<{
    Params: { taskId: string };
    Body: StartTaskRequest;
    Reply: StartTaskResponse;
  }>('/tasks/:taskId/start', {
    schema: {
      params: {
        type: 'object',
        properties: {
          taskId: { type: 'string' }
        },
        required: ['taskId']
      },
      body: {
        type: 'object',
        properties: {
          stream: { type: 'boolean' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            stream: { type: 'boolean' }
          },
          required: ['message']
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { taskId: string }; Body: StartTaskRequest }>, reply: FastifyReply) => {
    try {
      const { taskId } = request.params;
      const { stream = false } = request.body || {};
      
      if (stream) {
        // 对于流式输出，立即返回响应，让任务在后台异步执行
        const response: StartTaskResponse = {
          message: 'Task started successfully',
          stream
        };
        reply.code(200).send(response);
        
        // 异步启动任务，不等待完成
        taskManager.startTask(taskId, { stream }).catch(error => {
          logger.error('Task execution failed', { error, taskId });
        });
      } else {
        // 对于非流式输出，等待任务完成
        await taskManager.startTask(taskId, { stream });
        
        const response: StartTaskResponse = {
          message: 'Task started successfully',
          stream
        };
        
        reply.code(200).send(response);
      }
    } catch (error) {
      logger.error('Failed to start task', { error, taskId: request.params.taskId });
      reply.code(500).send({
        error: 'Failed to start task',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 暂停任务
  fastify.post<{
    Params: { taskId: string };
  }>('/tasks/:taskId/pause', {
    schema: {
      params: {
        type: 'object',
        properties: {
          taskId: { type: 'string' }
        },
        required: ['taskId']
      }
    }
  }, async (request: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
    try {
      const { taskId } = request.params;
      
      await taskManager.pauseTask(taskId);
      
      reply.code(200).send({
        message: 'Task paused successfully'
      });
    } catch (error) {
      logger.error('Failed to pause task', { error, taskId: request.params.taskId });
      reply.code(500).send({
        error: 'Failed to pause task',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 恢复任务
  fastify.post<{
    Params: { taskId: string };
  }>('/tasks/:taskId/resume', {
    schema: {
      params: {
        type: 'object',
        properties: {
          taskId: { type: 'string' }
        },
        required: ['taskId']
      }
    }
  }, async (request: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
    try {
      const { taskId } = request.params;
      
      await taskManager.resumeTask(taskId);
      
      reply.code(200).send({
        message: 'Task resumed successfully'
      });
    } catch (error) {
      logger.error('Failed to resume task', { error, taskId: request.params.taskId });
      reply.code(500).send({
        error: 'Failed to resume task',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 中止任务
  fastify.post<{
    Params: { taskId: string };
  }>('/tasks/:taskId/abort', {
    schema: {
      params: {
        type: 'object',
        properties: {
          taskId: { type: 'string' }
        },
        required: ['taskId']
      }
    }
  }, async (request: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
    try {
      const { taskId } = request.params;
      
      await taskManager.abortTask(taskId);
      
      reply.code(200).send({
        message: 'Task aborted successfully'
      });
    } catch (error) {
      logger.error('Failed to abort task', { error, taskId: request.params.taskId });
      reply.code(500).send({
        error: 'Failed to abort task',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 删除任务
  fastify.delete<{
    Params: { taskId: string };
  }>('/tasks/:taskId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          taskId: { type: 'string' }
        },
        required: ['taskId']
      }
    }
  }, async (request: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
    try {
      const { taskId } = request.params;
      
      await taskManager.deleteTask(taskId);
      
      reply.code(200).send({
        message: 'Task deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete task', { error, taskId: request.params.taskId });
      reply.code(500).send({
        error: 'Failed to delete task',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // SSE接口 - 实时查看任务执行过程中模型的输入内容
  fastify.get<{
    Params: { taskId: string };
  }>('/tasks/:taskId/stream', {
    schema: {
      params: {
        type: 'object',
        properties: {
          taskId: { type: 'string' }
        },
        required: ['taskId']
      }
    }
  }, async (request: FastifyRequest<{ Params: { taskId: string } }>, reply: FastifyReply) => {
    const { taskId } = request.params;
    
    try {
      // 检查任务是否存在
      const task = await taskManager.getTask(taskId);
      if (!task) {
        reply.code(404).send({
          error: 'Task not found',
          message: `Task with ID ${taskId} does not exist`
        });
        return;
      }

      // 设置SSE响应头
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      // 发送初始连接确认
      reply.raw.write(`data: ${JSON.stringify({
        type: 'connected',
        taskId,
        timestamp: new Date().toISOString(),
        message: 'Connected to task stream'
      })}\n\n`);

      // 发送任务当前状态
      const currentStatus = task.getStatus();
      reply.raw.write(`data: ${JSON.stringify({
        type: 'task_status',
        taskId,
        status: currentStatus,
        timestamp: new Date().toISOString()
      })}\n\n`);

      // 发送已有的消息历史
      const messages = task.getMessages();
      if (messages && messages.length > 0) {
        reply.raw.write(`data: ${JSON.stringify({
          type: 'message_history',
          taskId,
          messages: messages,
          timestamp: new Date().toISOString()
        })}\n\n`);
      }

      // 监听任务事件
      const onTaskUpdate = (data: any) => {
        if (data.taskId === taskId) {
          reply.raw.write(`data: ${JSON.stringify({
            type: 'task_update',
            taskId,
            ...data,
            timestamp: new Date().toISOString()
          })}\n\n`);
        }
      };

      const onTaskMessage = (data: any) => {
        if (data.taskId === taskId) {
          reply.raw.write(`data: ${JSON.stringify({
            type: 'task_message',
            taskId,
            message: data.message,
            timestamp: new Date().toISOString()
          })}\n\n`);
        }
      };

      const onApiRequest = (data: any) => {
        if (data.taskId === taskId) {
          reply.raw.write(`data: ${JSON.stringify({
            type: 'api_request',
            taskId,
            request: data.request,
            model: data.model,
            timestamp: new Date().toISOString()
          })}\n\n`);
        }
      };

      const onApiResponse = (data: any) => {
        if (data.taskId === taskId) {
          reply.raw.write(`data: ${JSON.stringify({
            type: 'api_response',
            taskId,
            response: data.response,
            timestamp: new Date().toISOString()
          })}\n\n`);
        }
      };

      const onTaskCompleted = (data: any) => {
        if (data.taskId === taskId) {
          reply.raw.write(`data: ${JSON.stringify({
            type: 'task_completed',
            taskId,
            result: data.result,
            timestamp: new Date().toISOString()
          })}\n\n`);
          
          // 任务完成后立即关闭连接
          reply.raw.end();
        }
      };

      const onTaskError = (data: any) => {
        if (data.taskId === taskId) {
          reply.raw.write(`data: ${JSON.stringify({
            type: 'task_error',
            taskId,
            error: data.error,
            timestamp: new Date().toISOString()
          })}\n\n`);
        }
      };

      const onToolCall = (data: any) => {
        if (data.taskId === taskId) {
          reply.raw.write(`data: ${JSON.stringify({
            type: 'tool_call',
            taskId,
            toolCall: data.toolCall,
            timestamp: new Date().toISOString()
          })}\n\n`);
        }
      };

      const onToolResult = (data: any) => {
        if (data.taskId === taskId) {
          reply.raw.write(`data: ${JSON.stringify({
            type: 'tool_result',
            taskId,
            toolCall: data.toolCall,
            result: data.result,
            timestamp: new Date().toISOString()
          })}\n\n`);
        }
      };

      // 注册事件监听器
      taskManager.on('taskStatusUpdate', onTaskUpdate);
      taskManager.on('task:message', onTaskMessage);
      taskManager.on('task:apiRequest', onApiRequest);
      taskManager.on('task:apiResponse', onApiResponse);
      taskManager.on('task:completed', onTaskCompleted);
      taskManager.on('task:error', onTaskError);
      taskManager.on('task:tool:call', onToolCall);
      taskManager.on('task:tool:result', onToolResult);

      // 处理客户端断开连接
      request.raw.on('close', () => {
        logger.info(`SSE client disconnected for task ${taskId}`);
        taskManager.removeListener('taskStatusUpdate', onTaskUpdate);
        taskManager.removeListener('task:message', onTaskMessage);
        taskManager.removeListener('task:apiRequest', onApiRequest);
        taskManager.removeListener('task:apiResponse', onApiResponse);
        taskManager.removeListener('task:completed', onTaskCompleted);
        taskManager.removeListener('task:error', onTaskError);
        taskManager.removeListener('task:tool:call', onToolCall);
        taskManager.removeListener('task:tool:result', onToolResult);
      });

      // 发送心跳包
      const heartbeat = setInterval(() => {
        try {
          reply.raw.write(`data: ${JSON.stringify({
            type: 'heartbeat',
            taskId,
            timestamp: new Date().toISOString()
          })}\n\n`);
        } catch (error) {
          clearInterval(heartbeat);
        }
      }, 30000); // 每30秒发送一次心跳

      // 清理心跳定时器
      request.raw.on('close', () => {
        clearInterval(heartbeat);
      });

      logger.info(`SSE client connected for task ${taskId}`);
      
    } catch (error) {
      logger.error('Failed to setup SSE stream', { error, taskId });
      reply.code(500).send({
        error: 'Failed to setup stream',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // 融合接口 - 创建并启动任务，支持流式响应
  fastify.post<{
    Body: CreateTaskRequest & { stream?: boolean; autoStart?: boolean };
    Reply: CreateTaskResponse | any; // 流式响应时返回SSE
  }>('/tasks/run', {
    schema: {
      body: {
        type: 'object',
        required: ['task'],
        properties: {
          task: { type: 'string' },
          images: {
            type: 'array',
            items: { type: 'string' }
          },
          workspacePath: { type: 'string' },
          apiConfiguration: {
            type: 'object',
            properties: {
              provider: { type: 'string' },
              apiKey: { type: 'string' },
              model: { type: 'string' },
              baseUrl: { type: 'string' },
              maxTokens: { type: 'number' },
              temperature: { type: 'number' }
            }
          },
          stream: { type: 'boolean' },
          autoStart: { type: 'boolean' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            taskId: { type: 'string' },
            status: { type: 'string' },
            message: { type: 'string' },
            stream: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request: FastifyRequest<{ Body: CreateTaskRequest & { stream?: boolean; autoStart?: boolean } }>, reply: FastifyReply) => {
    try {
      const { task, images, workspacePath, apiConfiguration, stream = false, autoStart = true } = request.body;
      
      logger.info('Creating and running new task', { task: task.substring(0, 100), stream, autoStart });
      
      // 1. 创建任务
      const createTaskRequest: any = {
        task: request.body.task,
        images: images || [],
        workspacePath: workspacePath || process.cwd()
      };
      
      if (apiConfiguration) {
        createTaskRequest.apiConfiguration = apiConfiguration;
      }
      
      const taskId = await taskManager.createTask(createTaskRequest);
      
      // 2. 如果需要流式响应，设置SSE
      if (stream) {
        // 检查任务是否存在
        const task = await taskManager.getTask(taskId);
        if (!task) {
          reply.code(404).send({
            error: 'Task not found',
            message: `Task with ID ${taskId} does not exist`
          });
          return;
        }

        // 设置SSE响应头
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control'
        });

        // 发送初始连接确认和任务创建信息
        reply.raw.write(`data: ${JSON.stringify({
          type: 'task_created',
          taskId,
          status: 'created',
          message: 'Task created successfully',
          timestamp: new Date().toISOString()
        })}\n\n`);

        // 发送任务当前状态
        const currentStatus = task.getStatus();
        reply.raw.write(`data: ${JSON.stringify({
          type: 'task_status',
          taskId,
          status: currentStatus,
          timestamp: new Date().toISOString()
        })}\n\n`);

        // 发送已有的消息历史
        const messages = task.getMessages();
        if (messages && messages.length > 0) {
          reply.raw.write(`data: ${JSON.stringify({
            type: 'message_history',
            taskId,
            messages: messages,
            timestamp: new Date().toISOString()
          })}\n\n`);
        }

        // 监听任务事件
        const onTaskUpdate = (data: any) => {
          if (data.taskId === taskId) {
            reply.raw.write(`data: ${JSON.stringify({
              type: 'task_update',
              taskId,
              ...data,
              timestamp: new Date().toISOString()
            })}\n\n`);
          }
        };

        const onTaskMessage = (data: any) => {
          if (data.taskId === taskId) {
            reply.raw.write(`data: ${JSON.stringify({
              type: 'task_message',
              taskId,
              message: data.message,
              timestamp: new Date().toISOString()
            })}\n\n`);
          }
        };

        const onApiRequest = (data: any) => {
          if (data.taskId === taskId) {
            reply.raw.write(`data: ${JSON.stringify({
              type: 'api_request',
              taskId,
              request: data.request,
              model: data.model,
              timestamp: new Date().toISOString()
            })}\n\n`);
          }
        };

        const onApiResponse = (data: any) => {
          if (data.taskId === taskId) {
            reply.raw.write(`data: ${JSON.stringify({
              type: 'api_response',
              taskId,
              response: data.response,
              timestamp: new Date().toISOString()
            })}\n\n`);
          }
        };

        const onTaskCompleted = (data: any) => {
          if (data.taskId === taskId) {
            reply.raw.write(`data: ${JSON.stringify({
              type: 'task_completed',
              taskId,
              result: data.result,
              timestamp: new Date().toISOString()
            })}\n\n`);
            
            // 任务完成后立即关闭连接
            reply.raw.end();
          }
        };

        const onTaskError = (data: any) => {
          if (data.taskId === taskId) {
            reply.raw.write(`data: ${JSON.stringify({
              type: 'task_error',
              taskId,
              error: data.error,
              timestamp: new Date().toISOString()
            })}\n\n`);
          }
        };

        const onToolCall = (data: any) => {
          if (data.taskId === taskId) {
            reply.raw.write(`data: ${JSON.stringify({
              type: 'tool_call',
              taskId,
              toolCall: data.toolCall,
              timestamp: new Date().toISOString()
            })}\n\n`);
          }
        };

        const onToolResult = (data: any) => {
          if (data.taskId === taskId) {
            reply.raw.write(`data: ${JSON.stringify({
              type: 'tool_result',
              taskId,
              toolCall: data.toolCall,
              result: data.result,
              timestamp: new Date().toISOString()
            })}\n\n`);
          }
        };

        // 注册事件监听器
        taskManager.on('taskStatusUpdate', onTaskUpdate);
        taskManager.on('task:message', onTaskMessage);
        taskManager.on('task:apiRequest', onApiRequest);
        taskManager.on('task:apiResponse', onApiResponse);
        taskManager.on('task:completed', onTaskCompleted);
        taskManager.on('task:error', onTaskError);
        taskManager.on('task:tool:call', onToolCall);
        taskManager.on('task:tool:result', onToolResult);

        // 处理客户端断开连接
        request.raw.on('close', () => {
          logger.info(`SSE client disconnected for task ${taskId}`);
          taskManager.removeListener('taskStatusUpdate', onTaskUpdate);
          taskManager.removeListener('task:message', onTaskMessage);
          taskManager.removeListener('task:apiRequest', onApiRequest);
          taskManager.removeListener('task:apiResponse', onApiResponse);
          taskManager.removeListener('task:completed', onTaskCompleted);
          taskManager.removeListener('task:error', onTaskError);
          taskManager.removeListener('task:tool:call', onToolCall);
          taskManager.removeListener('task:tool:result', onToolResult);
        });

        // 发送心跳包
        const heartbeat = setInterval(() => {
          try {
            reply.raw.write(`data: ${JSON.stringify({
              type: 'heartbeat',
              taskId,
              timestamp: new Date().toISOString()
            })}\n\n`);
          } catch (error) {
            clearInterval(heartbeat);
          }
        }, 30000); // 每30秒发送一次心跳

        // 清理心跳定时器
        request.raw.on('close', () => {
          clearInterval(heartbeat);
        });

        logger.info(`SSE client connected for task ${taskId}`);
        
        // 3. 如果需要自动启动，启动任务
        if (autoStart) {
          // 发送任务启动通知
          reply.raw.write(`data: ${JSON.stringify({
            type: 'task_starting',
            taskId,
            message: 'Task is starting...',
            timestamp: new Date().toISOString()
          })}\n\n`);
          
          // 异步启动任务
          taskManager.startTask(taskId, { stream: true }).catch(error => {
            logger.error('Task execution failed', { error, taskId });
            reply.raw.write(`data: ${JSON.stringify({
              type: 'task_error',
              taskId,
              error: error.message,
              timestamp: new Date().toISOString()
            })}\n\n`);
          });
        }
        
      } else {
        // 非流式响应
        if (autoStart) {
          // 启动任务并等待完成
          await taskManager.startTask(taskId, { stream: false });
          
          const response = {
            taskId,
            status: 'completed',
            message: 'Task created and completed successfully',
            stream: false,
            createdAt: new Date()
          };
          
          reply.code(200).send(response);
        } else {
          // 只创建任务，不启动
          const response = {
            taskId,
            status: 'created',
            message: 'Task created successfully',
            stream: false,
            createdAt: new Date()
          };
          
          reply.code(200).send(response);
        }
      }
      
    } catch (error) {
      logger.error('Failed to create and run task', { error });
      
      if (request.body.stream) {
        // 流式响应中的错误处理
        try {
          reply.raw.write(`data: ${JSON.stringify({
            type: 'error',
            error: 'Failed to create and run task',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
          })}\n\n`);
          reply.raw.end();
        } catch (writeError) {
          logger.error('Failed to write error to stream', { writeError });
        }
      } else {
        // 普通响应中的错误处理
        reply.code(500).send({
          error: 'Failed to create and run task',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  });
}