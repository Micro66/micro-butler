import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CreateTaskRequest, CreateTaskResponse, GetTaskResponse, ListTasksResponse } from '@/types';
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
  }>('/tasks/:taskId/start', {
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
      
      await taskManager.startTask(taskId);
      
      reply.code(200).send({
        message: 'Task started successfully'
      });
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
}