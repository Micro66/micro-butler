import { UseMCPTool } from '../../../src/tools/mcp/UseMCPTool';
import { ToolExecutionContext } from '../../../src/types';

describe('UseMCPTool', () => {
  let tool: UseMCPTool;
  let mockContext: ToolExecutionContext;
  let mockMCPManager: any;

  beforeEach(() => {
    tool = new UseMCPTool();
    
    // Mock MCPManager
    mockMCPManager = {
      isServerConnected: jest.fn().mockReturnValue(true),
      getServerTools: jest.fn().mockResolvedValue([
        { name: 'get_weather', description: 'Get weather information' },
        { name: 'send_email', description: 'Send an email' },
        { name: 'test_tool', description: 'Test tool for testing' }
      ]),
      getServerConfig: jest.fn().mockReturnValue({}),
      callTool: jest.fn().mockImplementation(async (serverName: string, toolName: string, args: any) => {
          // Add small delay to ensure executionTime > 0
          await new Promise(resolve => setTimeout(resolve, 1));
          return {
            content: 'MCP tool execution ready - MCPManager integration pending',
            isError: false
          };
        })
    };
    
    mockContext = {
      parameters: {},
      workspacePath: '/test/workspace',
      taskId: 'test-task-id',
      security: {},
      securityManager: undefined,
      mcpManager: mockMCPManager
    } as any;
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
      // Reset mock to ensure server is connected
      mockMCPManager.isServerConnected.mockReturnValue(true);
      
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
        content: 'MCP tool execution ready - MCPManager integration pending',
        isError: false
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
      // Mock server not connected scenario
      mockMCPManager.isServerConnected.mockReturnValue(false);
      
      mockContext.parameters = {
        server_name: 'disconnected_server',
        tool_name: 'test_tool'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe("MCP server 'disconnected_server' is not connected");
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