import { UseMCPTool } from '../../../src/tools/mcp/UseMCPTool';
import { ToolExecutionContext } from '../../../src/types';

describe('UseMCPTool', () => {
  let tool: UseMCPTool;
  let mockContext: ToolExecutionContext;

  beforeEach(() => {
    tool = new UseMCPTool();
    mockContext = {
      parameters: {},
      workspacePath: '/test/workspace',
      taskId: 'test-task-id',
      security: {},
      securityManager: undefined
    };
    jest.clearAllMocks();
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('use_mcp_tool');
    });

    it('should have correct description', () => {
      expect(tool.description).toBe('Request to use a tool provided by a connected MCP server');
    });

    it('should have correct parameters schema', () => {
      expect(tool.parameters).toEqual({
        type: 'object',
        properties: {
          server_name: {
            type: 'string',
            description: 'The name of the MCP server providing the tool'
          },
          tool_name: {
            type: 'string',
            description: 'The name of the tool to execute'
          },
          arguments: {
            type: 'object',
            description: 'A JSON object containing the tool\'s input parameters'
          }
        },
        required: ['server_name', 'tool_name']
      });
    });
  });

  describe('Parameter Validation', () => {
    it('should return error when server_name is missing', async () => {
      mockContext.parameters = {
        tool_name: 'test_tool'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing required parameter: server_name');
    });

    it('should return error when tool_name is missing', async () => {
      mockContext.parameters = {
        server_name: 'test_server'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing required parameter: tool_name');
    });

    it('should accept valid parameters', async () => {
      mockContext.parameters = {
        server_name: 'test_server',
        tool_name: 'test_tool',
        arguments: { param1: 'value1' }
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        server: 'test_server',
        tool: 'test_tool',
        arguments: { param1: 'value1' },
        message: 'MCP tool execution ready - MCPManager integration pending'
      });
    });
  });

  describe('Tool Execution', () => {
    it('should execute successfully with minimal parameters', async () => {
      mockContext.parameters = {
        server_name: 'weather_server',
        tool_name: 'get_weather'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result.server).toBe('weather_server');
      expect(result.result.tool).toBe('get_weather');
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should execute successfully with arguments', async () => {
      const testArguments = {
        location: 'San Francisco',
        units: 'metric'
      };
      
      mockContext.parameters = {
        server_name: 'weather_server',
        tool_name: 'get_weather',
        arguments: testArguments
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result.arguments).toEqual(testArguments);
    });

    it('should handle execution errors gracefully', async () => {
      // Mock an error scenario by providing invalid context
      const invalidContext = {
        ...mockContext,
        parameters: {
          server_name: 'test_server',
          tool_name: 'test_tool'
        }
      } as any;
      
      // Remove required properties to trigger error
      delete invalidContext.taskId;

      const result = await tool.execute(invalidContext);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.executionTime).toBeGreaterThan(0);
    });
  });

  describe('Tool Definition', () => {
    it('should return correct tool definition', () => {
      const definition = tool.getDefinition();

      expect(definition.name).toBe('use_mcp_tool');
      expect(definition.description).toBe('Request to use a tool provided by a connected MCP server');
      expect(definition.parameters).toEqual(tool.parameters);
      expect(definition.group).toBe('command');
      expect(typeof definition.execute).toBe('function');
    });
  });
});