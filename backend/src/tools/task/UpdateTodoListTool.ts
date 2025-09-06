import { ToolExecutionContext, ToolExecutionResult } from '@/types';
import { BaseTool, getToolsLogger } from '../base/BaseTool';

/**
 * 更新待办事项列表工具
 */
export class UpdateTodoListTool extends BaseTool {
  name = 'update_todo_list';
  description = 'Update and manage the todo list for the current session';
  parameters = {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'The action to perform',
        enum: ['add', 'update', 'remove', 'complete', 'list']
      },
      item_id: {
        type: 'string',
        description: 'The ID of the todo item (required for update, remove, complete actions)'
      },
      title: {
        type: 'string',
        description: 'The title of the todo item (required for add action)'
      },
      description: {
        type: 'string',
        description: 'The description of the todo item',
        default: ''
      },
      priority: {
        type: 'string',
        description: 'The priority level',
        enum: ['low', 'medium', 'high'],
        default: 'medium'
      },
      status: {
        type: 'string',
        description: 'The status of the todo item',
        enum: ['pending', 'in_progress', 'completed'],
        default: 'pending'
      }
    },
    required: ['action']
  };

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { 
        action, 
        item_id, 
        title, 
        description = '', 
        priority = 'medium', 
        status = 'pending' 
      } = context.parameters;
      
      // 获取或初始化待办事项列表
      const todoList = this.getTodoList(context);
      let result: any = {};
      
      switch (action) {
        case 'add':
          if (!title) {
            throw new Error('Title is required for add action');
          }
          const newItem = {
            id: this.generateId(),
            title,
            description,
            priority,
            status,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          todoList.push(newItem);
          result = {
            action: 'add',
            item: newItem,
            message: `Added todo item: ${title}`
          };
          break;
          
        case 'update':
          if (!item_id) {
            throw new Error('Item ID is required for update action');
          }
          const updateIndex = todoList.findIndex((item: any) => item.id === item_id);
          if (updateIndex === -1) {
            throw new Error(`Todo item not found: ${item_id}`);
          }
          const updatedItem = {
            ...todoList[updateIndex],
            ...(title && { title }),
            ...(description !== undefined && { description }),
            ...(priority && { priority }),
            ...(status && { status }),
            updated_at: new Date().toISOString()
          };
          todoList[updateIndex] = updatedItem;
          result = {
            action: 'update',
            item: updatedItem,
            message: `Updated todo item: ${item_id}`
          };
          break;
          
        case 'remove':
          if (!item_id) {
            throw new Error('Item ID is required for remove action');
          }
          const removeIndex = todoList.findIndex((item: any) => item.id === item_id);
          if (removeIndex === -1) {
            throw new Error(`Todo item not found: ${item_id}`);
          }
          const removedItem = todoList.splice(removeIndex, 1)[0];
          result = {
            action: 'remove',
            item: removedItem,
            message: `Removed todo item: ${item_id}`
          };
          break;
          
        case 'complete':
          if (!item_id) {
            throw new Error('Item ID is required for complete action');
          }
          const completeIndex = todoList.findIndex((item: any) => item.id === item_id);
          if (completeIndex === -1) {
            throw new Error(`Todo item not found: ${item_id}`);
          }
          todoList[completeIndex].status = 'completed';
          todoList[completeIndex].updated_at = new Date().toISOString();
          result = {
            action: 'complete',
            item: todoList[completeIndex],
            message: `Completed todo item: ${item_id}`
          };
          break;
          
        case 'list':
          result = {
            action: 'list',
            items: todoList,
            count: todoList.length,
            message: `Retrieved ${todoList.length} todo items`
          };
          break;
          
        default:
          throw new Error(`Unsupported action: ${action}`);
      }
      
      // 保存更新后的待办事项列表
      this.saveTodoList(context, todoList);
      
      return {
        success: true,
        result,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      getToolsLogger().error('Failed to update todo list', error as Error, { 
        action: context.parameters.action,
        item_id: context.parameters.item_id 
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }
  
  private getTodoList(context: ToolExecutionContext): any[] {
    // 在实际实现中，这里应该从持久化存储中获取待办事项列表
    // 目前使用内存存储作为示例
    return (context as any).todoList || [];
  }
  
  private saveTodoList(context: ToolExecutionContext, todoList: any[]): void {
    // 在实际实现中，这里应该将待办事项列表保存到持久化存储中
    // 目前使用内存存储作为示例
    (context as any).todoList = todoList;
  }
  
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}