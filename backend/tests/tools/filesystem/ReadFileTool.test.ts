import { ReadFileTool } from '../../../src/tools/filesystem/ReadFileTool';
import { ToolExecutionContext } from '../../../src/types';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// Mock fs module
jest.mock('node:fs/promises');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('ReadFileTool', () => {
  let tool: ReadFileTool;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    tool = new ReadFileTool();
    mockContext = {
      parameters: {},
      workspacePath: '/test/workspace',
      taskId: 'test-task-id',
      security: {},
      securityManager: {
        validateFileAccess: jest.fn().mockReturnValue(true)
      }
    };
    jest.clearAllMocks();
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('read_file');
    });

    it('should have correct description', () => {
      expect(tool.description).toBe('Read the contents of a file');
    });

    it('should have correct parameters schema', () => {
      expect(tool.parameters).toEqual({
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path to the file to read'
          }
        },
        required: ['path']
      });
    });
  });

  describe('execute', () => {
    it('should read file successfully with default encoding', async () => {
      const testContent = 'Hello, World!';
      const filePath = '/test/file.txt';
      
      mockFs.readFile.mockResolvedValue(testContent);
      
      mockContext.parameters = { path: filePath };
      
      const result = await tool.execute(mockContext);
      
      expect(mockFs.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
      expect(result.success).toBe(true);
      expect(result.result).toBe(testContent);
      expect(result.error).toBeUndefined();
    });

    it('should read file with custom encoding', async () => {
      const testContent = Buffer.from('Hello, World!');
      const filePath = '/test/file.txt';
      const encoding = 'base64';
      
      mockFs.readFile.mockResolvedValue(testContent);
      
      mockContext.parameters = { path: filePath, encoding };
      
      const result = await tool.execute(mockContext);
      
      expect(result.success).toBe(true);
      expect(result.result).toBe(testContent);
    });

    it('should handle file not found error', async () => {
      const filePath = '/test/nonexistent.txt';
      const error = new Error('ENOENT: no such file or directory');
      (error as any).code = 'ENOENT';
      
      mockFs.readFile.mockRejectedValue(error);
      
      mockContext.parameters = { path: filePath };
      
      const result = await tool.execute(mockContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('ENOENT: no such file or directory');
    });

    it('should handle permission denied error', async () => {
      const filePath = '/test/protected.txt';
      const error = new Error('EACCES: permission denied');
      (error as any).code = 'EACCES';
      
      mockFs.readFile.mockRejectedValue(error);
      
      mockContext.parameters = { path: filePath };
      
      const result = await tool.execute(mockContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('EACCES: permission denied');
    });

    it('should handle generic errors', async () => {
      const filePath = '/test/file.txt';
      const error = new Error('Generic error');
      
      mockFs.readFile.mockRejectedValue(error);
      
      mockContext.parameters = { path: filePath };
      
      const result = await tool.execute(mockContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Generic error');
    });

    it('should handle missing file_path parameter', async () => {
      mockContext.parameters = {};
      
      const result = await tool.execute(mockContext);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('path');
    });
  });
});