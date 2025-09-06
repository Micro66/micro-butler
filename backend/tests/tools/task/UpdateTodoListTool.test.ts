import { UpdateTodoListTool } from '../../../src/tools/task/UpdateTodoListTool';
import { ToolExecutionContext } from '../../../src/types';
import * as fs from 'node:fs/promises';

// Mock fs module
jest.mock('node:fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('UpdateTodoListTool', () => {
  let tool: UpdateTodoListTool;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    tool = new UpdateTodoListTool();
    mockContext = {
      parameters: {},
      workspacePath: '/test/workspace',
      taskId: 'test-task-id',
      security: {},
      securityManager: undefined,
      todoList: []
    } as any;
    jest.clearAllMocks();
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('update_todo_list');
    });

    it('should have correct description', () => {
      expect(tool.description).toBe('Update and manage the todo list for the current session');
    });

    it('should have correct parameters schema', () => {
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties).toHaveProperty('action');
      expect(tool.parameters.properties).toHaveProperty('title');
      expect(tool.parameters.properties).toHaveProperty('item_id');
      expect(tool.parameters.required).toContain('action');
    });
  });

  describe('execute', () => {
    const mockTodoList = [
      { id: '1', text: 'Task 1', completed: false },
      { id: '2', text: 'Task 2', completed: true }
    ];

    beforeEach(() => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockTodoList));
      mockFs.writeFile.mockResolvedValue(undefined);
    });

    it('should add new todo item', async () => {
      mockContext.parameters = {
        action: 'add',
        title: 'New Task'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
expect(result.error).toBeUndefined();
      expect((mockContext as any).todoList).toHaveLength(1);
    });

    it('should update existing todo item', async () => {
      (mockContext as any).todoList = [{ id: '1', title: 'Original Task', status: 'pending' }];
      mockContext.parameters = {
        action: 'update',
        item_id: '1',
        title: 'Updated Task',
        status: 'completed'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
expect(result.error).toBeUndefined();
      expect((mockContext as any).todoList[0].title).toBe('Updated Task');
    });

    it('should delete todo item', async () => {
      (mockContext as any).todoList = [{ id: '1', title: 'Task to Delete', status: 'pending' }];
      mockContext.parameters = {
        action: 'remove',
        item_id: '1'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
expect(result.error).toBeUndefined();
      expect((mockContext as any).todoList).toHaveLength(0);
    });

    it('should complete todo item', async () => {
      (mockContext as any).todoList = [{ id: '1', title: 'Task to Complete', status: 'pending' }];
      mockContext.parameters = {
        action: 'complete',
        item_id: '1'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
expect(result.error).toBeUndefined();
      expect((mockContext as any).todoList[0].status).toBe('completed');
    });

    it('should list all todo items', async () => {
      mockContext.parameters = {
        action: 'list'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result.items).toEqual([]);
      expect(result.result.count).toBe(0);
    });

    it('should handle empty todo list', async () => {
      mockContext.parameters = {
        action: 'list'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result.items).toEqual([]);
      expect(result.result.count).toBe(0);
    });

    it('should handle missing item_id for update action', async () => {
      mockContext.parameters = {
        action: 'update',
        title: 'Updated Task'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Item ID is required for update action');
    });

    it('should handle missing item_id for remove action', async () => {
      mockContext.parameters = {
        action: 'remove'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Item ID is required for remove action');
    });

    it('should handle unsupported operation', async () => {
      mockContext.parameters = {
        action: 'unsupported'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported action');
    });

    it('should handle missing item for operations that require it', async () => {
      mockContext.parameters = {
        action: 'add'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Title is required for add action');
    });

    it('should handle update of non-existent item', async () => {
      (mockContext as any).todoList = [{ id: '1', title: 'Existing Task', status: 'pending' }];
      mockContext.parameters = {
        action: 'update',
        item_id: 'non-existent',
        title: 'Updated'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Todo item not found');
    });

    it('should generate ID for new items without ID', async () => {
      mockContext.parameters = {
        action: 'add',
        title: 'New Task'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result.item.id).toBeDefined();
      expect(result.result.item.title).toBe('New Task');
      expect((mockContext as any).todoList).toHaveLength(1);
    });
  });
});