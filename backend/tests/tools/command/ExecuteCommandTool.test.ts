import { ExecuteCommandTool } from '../../../src/tools/command/ExecuteCommandTool';
import { ToolExecutionContext } from '../../../src/types';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

// Mock child_process
jest.mock('node:child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

// Mock child process
class MockChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = {
    write: jest.fn(),
    end: jest.fn()
  };
  kill = jest.fn();
}

describe('ExecuteCommandTool', () => {
  let tool: ExecuteCommandTool;
  let mockContext: ToolExecutionContext;
  let mockChild: MockChildProcess;

  beforeEach(() => {
    tool = new ExecuteCommandTool();
    mockContext = {
      parameters: {},
      workspacePath: '/test/workspace',
      taskId: 'test-task-id',
      security: {},
      securityManager: {
        validateToolExecution: jest.fn().mockResolvedValue(undefined)
      }
    };
    mockChild = new MockChildProcess();
    mockSpawn.mockReturnValue(mockChild as any);
    jest.clearAllMocks();
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('execute_command');
    });

    it('should have correct description', () => {
      expect(tool.description).toBe('Execute a shell command');
    });

    it('should have correct parameters schema', () => {
      expect(tool.parameters).toEqual({
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The command to execute'
          },
          cwd: {
            type: 'string',
            description: 'The working directory for the command'
          },
          timeout: {
            type: 'number',
            description: 'Timeout in milliseconds',
            default: 30000
          }
        },
        required: ['command']
      });
    });
  });

  describe('execute', () => {
    it('should execute command successfully', async () => {
      const command = 'echo "Hello World"';
      mockContext.parameters = { command };

      const executePromise = tool.execute(mockContext);

      // Simulate successful command execution
      setTimeout(() => {
        mockChild.stdout.emit('data', 'Hello World\n');
        mockChild.emit('close', 0);
      }, 10);

      const result = await executePromise;

      expect(mockSpawn).toHaveBeenCalledWith(command, [], {
        shell: true,
        cwd: '/test/workspace',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        command: 'echo "Hello World"',
        cwd: '/test/workspace',
        stdout: 'Hello World',
        stderr: '',
        exit_code: 0
      });
    });

    it('should handle command with custom working directory', async () => {
      const command = 'pwd';
      const cwd = '/custom/path';
      mockContext.parameters = { command, cwd };

      const executePromise = tool.execute(mockContext);

      setTimeout(() => {
        mockChild.stdout.emit('data', '/custom/path\n');
        mockChild.emit('close', 0);
      }, 10);

      const result = await executePromise;

      expect(mockSpawn).toHaveBeenCalledWith(command, [], {
        shell: true,
        cwd: '/custom/path',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      expect(result.success).toBe(true);
    });

    it('should handle command failure', async () => {
      const command = 'invalid-command';
      mockContext.parameters = { command };

      const executePromise = tool.execute(mockContext);

      setTimeout(() => {
        mockChild.stderr.emit('data', 'command not found\n');
        mockChild.emit('close', 127);
      }, 10);

      const result = await executePromise;

      expect(result.success).toBe(false);
      expect(result.result).toEqual({
        command: 'invalid-command',
        cwd: '/test/workspace',
        stdout: '',
        stderr: 'command not found',
        exit_code: 127
      });
    });

    it('should handle timeout', async () => {
      const command = 'sleep 10';
      const timeout = 100;
      mockContext.parameters = { command, timeout };

      const executePromise = tool.execute(mockContext);

      // Don't emit close event to simulate hanging command
      const result = await executePromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
      expect(mockChild.kill).toHaveBeenCalled();
    });

    it('should validate security before execution', async () => {
      const command = 'rm -rf /';
      mockContext.parameters = { command };
      mockContext.securityManager!.validateToolExecution = jest.fn().mockRejectedValue(
        new Error('Command execution denied')
      );

      const result = await tool.execute(mockContext);

      expect(mockContext.securityManager!.validateToolExecution).toHaveBeenCalledWith(
        { name: 'execute_command', parameters: { command } },
        mockContext
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('Command execution denied');
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should work without security manager', async () => {
      const command = 'echo test';
      mockContext.parameters = { command };
      mockContext.securityManager = undefined;

      const executePromise = tool.execute(mockContext);

      setTimeout(() => {
        mockChild.stdout.emit('data', 'test\n');
        mockChild.emit('close', 0);
      }, 10);

      const result = await executePromise;

      expect(result.success).toBe(true);
      expect(mockSpawn).toHaveBeenCalled();
    });

    it('should handle spawn error', async () => {
      const command = 'test-command';
      mockContext.parameters = { command };
      
      const mockChild = new MockChildProcess();
      mockSpawn.mockReturnValue(mockChild as any);
      
      // Simulate spawn error
      setTimeout(() => {
        mockChild.emit('error', new Error('Spawn failed'));
      }, 10);

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Spawn failed');
    });
  });
});