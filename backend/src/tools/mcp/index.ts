import { ToolDefinition } from '@/types';
import { UseMCPTool } from './UseMCPTool';
import { AccessMCPResourceTool } from './AccessMCPResourceTool';

/**
 * MCP 工具组
 * 提供与 Model Context Protocol 服务器交互的工具
 */
export class MCPTools {
  name = 'mcp';
  description = 'Model Context Protocol tools for external server integration';
  tools: ToolDefinition[] = [];

  constructor() {
    this.tools = [
      new UseMCPTool().getDefinition(),
      new AccessMCPResourceTool().getDefinition()
    ];
  }
}

// 导出具体工具类
export { UseMCPTool } from './UseMCPTool';
export { AccessMCPResourceTool } from './AccessMCPResourceTool';