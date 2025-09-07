import { ToolExecutionContext, ToolExecutionResult } from '@/types';
import { BaseTool, getToolsLogger } from '../base/BaseTool';
import { MCPManager } from '@/core/mcp/MCPManager';

/**
 * MCP 资源访问工具
 * 用于访问连接的 MCP 服务器提供的资源
 */
export class AccessMCPResourceTool extends BaseTool {
  name = 'access_mcp_resource';
  description = 'Request to access a resource provided by a connected MCP server';
  parameters = {
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
  };

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const logger = getToolsLogger();
    
    try {
      const { server_name, uri } = context.parameters;
      
      if (!server_name) {
        return {
          success: false,
          error: 'Missing required parameter: server_name',
          executionTime: Date.now() - startTime
        };
      }
      
      if (!uri) {
        return {
          success: false,
          error: 'Missing required parameter: uri',
          executionTime: Date.now() - startTime
        };
      }

      logger.info('Accessing MCP resource', {
        serverName: server_name,
        uri,
        taskId: context.taskId
      });

      // 获取 MCPManager 实例
      const mcpManager = (context as any).mcpManager as MCPManager;
      if (!mcpManager) {
        throw new Error('MCPManager not available in execution context');
      }
      
      // 验证服务器是否连接
      if (!mcpManager.isServerConnected(server_name)) {
        throw new Error(`MCP server '${server_name}' is not connected`);
      }
      
      // 访问资源（不需要预先验证资源是否存在，让 MCP 服务器处理）
      const result = await mcpManager.readResource(server_name, uri);
      
      logger.info('MCP resource access successful', {
        serverName: server_name,
        uri,
        result,
        taskId: context.taskId
      });

      return {
        success: true,
        result,
        executionTime: Date.now() - startTime
      };
      
    } catch (error) {
      logger.error('Failed to access MCP resource', error as Error, {
        serverName: context.parameters.server_name,
        uri: context.parameters.uri,
        taskId: context.taskId
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime
      };
    }
  }
}