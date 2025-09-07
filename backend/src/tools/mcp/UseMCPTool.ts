import { ToolExecutionContext, ToolExecutionResult } from '@/types';
import { BaseTool, getToolsLogger } from '../base/BaseTool';
import { MCPManager } from '@/core/mcp/MCPManager';

/**
 * MCP 工具调用工具
 * 用于调用连接的 MCP 服务器提供的工具
 */
export class UseMCPTool extends BaseTool {
  name = 'use_mcp_tool';
  description = 'Request to use a tool provided by a connected MCP server';
  parameters = {
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
  };

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const logger = getToolsLogger();
    
    try {
      const { server_name, tool_name, arguments: toolArguments } = context.parameters;
      
      if (!server_name) {
        return {
          success: false,
          error: 'Missing required parameter: server_name',
          executionTime: Date.now() - startTime
        };
      }
      
      if (!tool_name) {
        return {
          success: false,
          error: 'Missing required parameter: tool_name',
          executionTime: Date.now() - startTime
        };
      }

      logger.info('Executing MCP tool', {
        serverName: server_name,
        toolName: tool_name,
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
      
      // 验证工具是否存在，并处理工具别名
      const availableTools = await mcpManager.getServerTools(server_name);
      let actualToolName = tool_name;
      
      // 检查工具别名映射
      const serverConfig = mcpManager.getServerConfig(server_name);
      
      if (serverConfig?.toolAliases && serverConfig.toolAliases[tool_name]) {
        actualToolName = serverConfig.toolAliases[tool_name];
        logger.info(`✅ Using tool alias: ${tool_name} -> ${actualToolName}`, {
          serverName: server_name,
          taskId: context.taskId
        });
      }
      
      const tool = availableTools.find(t => t.name === actualToolName);
      if (!tool) {
        const toolNames = availableTools.map(t => t.name).join(', ');
        throw new Error(`Tool '${actualToolName}' not found on server '${server_name}'. Available tools: ${toolNames}`);
      }
      
      // 解析工具参数
      let parsedArguments = toolArguments;
      if (typeof toolArguments === 'string') {
        try {
          parsedArguments = JSON.parse(toolArguments);
        } catch (error) {
          throw new Error(`Invalid JSON in tool arguments: ${error}`);
        }
      }
      
      // 调用 MCP 工具
      const mcpResult = await mcpManager.callTool(server_name, actualToolName, parsedArguments);
      
      // 处理结果
      const result = {
        server: server_name,
        tool: tool_name,
        content: mcpResult.content,
        isError: mcpResult.isError
      };
      
      logger.info('MCP tool execution successful', {
        serverName: server_name,
        toolName: tool_name,
        result,
        taskId: context.taskId
      });

      return {
        success: true,
        result,
        executionTime: Date.now() - startTime
      };
      
    } catch (error) {
      logger.error('Failed to execute MCP tool', error as Error, {
        serverName: context.parameters.server_name,
        toolName: context.parameters.tool_name,
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