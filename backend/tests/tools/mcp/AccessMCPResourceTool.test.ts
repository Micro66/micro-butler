import { AccessMCPResourceTool } from '../../../src/tools/mcp/AccessMCPResourceTool';
import { ToolExecutionContext } from '../../../src/types';

describe('AccessMCPResourceTool', () => {
  let tool: AccessMCPResourceTool;
  let mockContext: ToolExecutionContext;
  let mockMCPManager: any;

  beforeEach(() => {
    tool = new AccessMCPResourceTool();
    
    // Mock MCPManager
    mockMCPManager = {
      isServerConnected: jest.fn().mockReturnValue(true),
      readResource: jest.fn().mockImplementation(async (serverName: string, uri: string) => {
        // Add small delay to ensure executionTime > 0
        await new Promise(resolve => setTimeout(resolve, 1));
        return {
          server: serverName,
          uri: uri,
          content: 'MCP resource access ready - MCPManager integration pending',
          mimeType: 'text/plain'
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
      expect(tool.name).toBe('access_mcp_resource');
    });

    it('should have correct description', () => {
      expect(tool.description).toBe('Request to access a resource provided by a connected MCP server');
    });

    it('should have correct parameters schema', () => {
      expect(tool.parameters).toEqual({
        type: 'object',
        properties: {
          server_name: {
            type: 'string',
            description: 'The name of the MCP server providing the resource'
          },
          uri: {
            type: 'string',
            description: 'The URI identifying the specific resource to access'
          }
        },
        required: ['server_name', 'uri']
      });
    });
  });

  describe('Parameter Validation', () => {
    it('should return error when server_name is missing', async () => {
      mockContext.parameters = {
        uri: 'weather://current'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing required parameter: server_name');
    });

    it('should return error when uri is missing', async () => {
      mockContext.parameters = {
        server_name: 'weather_server'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing required parameter: uri');
    });

    it('should accept valid parameters', async () => {
      mockContext.parameters = {
        server_name: 'weather_server',
        uri: 'weather://san-francisco/current'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result).toEqual({
        server: 'weather_server',
        uri: 'weather://san-francisco/current',
        content: 'MCP resource access ready - MCPManager integration pending',
        mimeType: 'text/plain'
      });
    });
  });

  describe('Resource Access', () => {
    it('should access resource successfully', async () => {
      mockContext.parameters = {
        server_name: 'file_server',
        uri: 'file:///path/to/document.txt'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result.server).toBe('file_server');
      expect(result.result.uri).toBe('file:///path/to/document.txt');
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should handle different URI schemes', async () => {
      const testCases = [
        {
          server_name: 'weather_server',
          uri: 'weather://london/forecast'
        },
        {
          server_name: 'database_server',
          uri: 'db://users/123'
        },
        {
          server_name: 'api_server',
          uri: 'api://v1/status'
        }
      ];

      for (const testCase of testCases) {
        mockContext.parameters = testCase;
        const result = await tool.execute(mockContext);

        expect(result.success).toBe(true);
        expect(result.result.server).toBe(testCase.server_name);
        expect(result.result.uri).toBe(testCase.uri);
      }
    });

    it('should handle execution errors gracefully', async () => {
      // Mock server not connected scenario
      mockMCPManager.isServerConnected.mockReturnValue(false);
      
      mockContext.parameters = {
        server_name: 'disconnected_server',
        uri: 'test://resource'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe("MCP server 'disconnected_server' is not connected");
      expect(result.executionTime).toBeGreaterThan(0);
      
      // Reset mock for other tests
      mockMCPManager.isServerConnected.mockReturnValue(true);
    });
  });

  describe('Tool Definition', () => {
    it('should return correct tool definition', () => {
      const definition = tool.getDefinition();

      expect(definition.name).toBe('access_mcp_resource');
      expect(definition.description).toBe('Request to access a resource provided by a connected MCP server');
      expect(definition.parameters).toEqual(tool.parameters);
      expect(definition.group).toBe('command');
      expect(typeof definition.execute).toBe('function');
    });
  });

  describe('URI Validation', () => {
    it('should accept various URI formats', async () => {
      const validUris = [
        'http://example.com/resource',
        'https://api.example.com/v1/data',
        'file:///path/to/file.txt',
        'weather://city/current',
        'db://table/record/123',
        'custom-scheme://resource-id'
      ];

      for (const uri of validUris) {
        mockContext.parameters = {
          server_name: 'test_server',
          uri
        };

        const result = await tool.execute(mockContext);
        expect(result.success).toBe(true);
        expect(result.result.uri).toBe(uri);
      }
    });

    it('should handle empty or whitespace URIs', async () => {
      const invalidUris = ['', '   ', '\t\n'];

      for (const uri of invalidUris) {
        mockContext.parameters = {
          server_name: 'test_server',
          uri
        };

        const result = await tool.execute(mockContext);
        expect(result.success).toBe(false);
        expect(result.error).toBe('Missing required parameter: uri');
      }
    });
  });
});