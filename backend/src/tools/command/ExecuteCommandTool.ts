import { ToolExecutionContext, ToolExecutionResult } from '@/types';
import { BaseTool, getToolsLogger } from '../base/BaseTool';

/**
 * 执行命令工具
 */
export class ExecuteCommandTool extends BaseTool {
  name = 'execute_command';
  description = 'Execute a shell command';
  parameters = {
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
  };

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const { command, cwd, timeout = 30000 } = context.parameters;
      const { spawn } = await import('node:child_process');
      const { promisify } = await import('node:util');
      
      // 安全检查
      if (context.securityManager) {
        await context.securityManager.validateToolExecution(
          { name: this.name, parameters: context.parameters },
          context
        );
      }
      
      return new Promise((resolve) => {
        // 优先使用context.workspacePath，然后是参数中的cwd，最后是process.cwd()
        const workingDirectory = cwd || context.workspacePath || process.cwd();
        
        const child = spawn(command, [], {
          shell: true,
          cwd: workingDirectory,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout?.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.stderr?.on('data', (data) => {
          stderr += data.toString();
        });
        
        const timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          resolve({
            success: false,
            error: `Command timed out after ${timeout}ms`,
            executionTime: Date.now() - startTime
          });
        }, timeout);
        
        child.on('close', (code) => {
          clearTimeout(timeoutId);
          
          const result = {
            command,
            exit_code: code,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            cwd: workingDirectory
          };
          
          if (code === 0) {
            resolve({
              success: true,
              result,
              executionTime: Date.now() - startTime
            });
          } else {
            resolve({
              success: false,
              error: `Command failed with exit code ${code}`,
              result,
              executionTime: Date.now() - startTime
            });
          }
        });
        
        child.on('error', (error) => {
          clearTimeout(timeoutId);
          getToolsLogger().error('Command execution failed', error, { command, cwd });
          resolve({
            success: false,
            error: error.message,
            executionTime: Date.now() - startTime
          });
        });
      });
    } catch (error) {
      getToolsLogger().error('Failed to execute command', error as Error, { 
        command: context.parameters.command,
        cwd: context.parameters.cwd 
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }
}