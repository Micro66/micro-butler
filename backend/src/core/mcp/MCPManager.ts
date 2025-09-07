import { EventEmitter } from 'node:events';
import { Logger } from 'winston';
import { ConfigManager } from '@/config/ConfigManager';
import { MCPServer, MCPTool, MCPResource, MCPToolCallResponse, MCPResourceResponse } from '@/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, ChildProcess } from 'child_process';

/**
 * MCP Manager - 管理 Model Context Protocol 服务器连接
 * 负责连接、断开连接、工具调用和资源访问
 */
export class MCPManager extends EventEmitter {
  private logger: Logger;
  private configManager: ConfigManager;
  private isInitialized: boolean = false;
  private servers: Map<string, MCPServer> = new Map();
  private clients: Map<string, Client> = new Map();
  private processes: Map<string, ChildProcess> = new Map();

  constructor(logger: Logger, configManager: ConfigManager) {
    super();
    this.logger = logger;
    this.configManager = configManager;
  }

  /**
   * 初始化 MCP 管理器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.logger.info('Initializing MCP Manager');
      
      // 读取 MCP 配置
      const config = this.configManager.getConfig();
      const mcpConfig = (config as any).mcpServers || {};
      
      if (!config.mcp?.enabled) {
        this.logger.info('MCP is disabled in configuration');
        this.isInitialized = true;
        return;
      }
      
      // 连接到配置的 MCP 服务器
      for (const [serverName, serverConfig] of Object.entries(mcpConfig)) {
        if ((serverConfig as any).disabled) {
          this.logger.info(`Skipping disabled MCP server: ${serverName}`);
          continue;
        }
        
        try {
          await this.connectToServer(serverName, serverConfig as any);
        } catch (error) {
          this.logger.error(`Failed to connect to MCP server ${serverName}:`, error);
        }
      }
      
      this.isInitialized = true;
      this.logger.info('MCP Manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize MCP Manager:', error);
      throw error;
    }
  }

  /**
   * 连接到 MCP 服务器
   */
  async connectToServer(serverName: string, config: any): Promise<void> {
    try {
      this.logger.info(`Connecting to MCP server: ${serverName}`, { config });
      
      if (config.type === 'stdio') {
        await this.connectStdioServer(serverName, config);
      } else {
        this.logger.warn(`Unsupported MCP server type: ${config.type}`);
        return;
      }
      
      this.logger.info(`Successfully connected to MCP server: ${serverName}`);
    } catch (error) {
      this.logger.error(`Failed to connect to MCP server ${serverName}:`, error);
      throw error;
    }
  }
  
  /**
   * 连接到 stdio MCP 服务器
   */
  private async connectStdioServer(serverName: string, config: any): Promise<void> {
    const { command, args = [], timeout = 30 } = config;
    
    if (!command) {
      throw new Error(`No command specified for MCP server ${serverName}`);
    }
    
    this.logger.info(`Starting MCP server process`, {
      serverName,
      command,
      args
    });
    
    // 创建 stdio 传输 - 让 SDK 自己管理进程
    const transport = new StdioClientTransport({
      command: command,
      args: args
    });
    
    // 创建客户端
    const client = new Client({
      name: 'micro-butler',
      version: '1.0.0'
    }, {
      capabilities: {
        tools: {},
        resources: {}
      }
    });
    
    this.clients.set(serverName, client);
    
    // 连接到服务器
    await client.connect(transport);
    
    // 获取服务器信息
    const tools = await this.getServerTools(serverName);
    const resources = await this.getServerResources(serverName);
    
    const server: MCPServer = {
      name: serverName,
      type: config.type || 'stdio',
      command: config.command,
      args: config.args,
      disabled: config.disabled || false,
      timeout: config.timeout || 30
    };
    
    this.servers.set(serverName, server);
    
    // 处理进程错误
    process.on('error', (error: any) => {
      this.logger.error(`MCP server process error for ${serverName}:`, error);
      this.disconnectFromServer(serverName);
    });
    
    process.on('exit', (code: any) => {
      this.logger.warn(`MCP server process exited for ${serverName} with code ${code}`);
      this.disconnectFromServer(serverName);
    });
  }

  /**
   * 断开与 MCP 服务器的连接
   */
  async disconnectFromServer(serverName: string): Promise<void> {
    try {
      this.logger.info(`Disconnecting from MCP server: ${serverName}`);
      
      // 关闭客户端连接
      const client = this.clients.get(serverName);
      if (client) {
        await client.close();
        this.clients.delete(serverName);
      }
      
      // 终止子进程
      const process = this.processes.get(serverName);
      if (process && !process.killed) {
        process.kill('SIGTERM');
        this.processes.delete(serverName);
      }
      
      // 移除服务器记录
      this.servers.delete(serverName);
      
      this.logger.info(`Successfully disconnected from MCP server: ${serverName}`);
    } catch (error) {
      this.logger.error(`Failed to disconnect from MCP server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * 调用 MCP 工具
   */
  async callTool(serverName: string, toolName: string, arguments_: any): Promise<MCPToolCallResponse> {
    try {
      this.logger.info(`Calling MCP tool: ${toolName} on server: ${serverName}`, { arguments: arguments_ });
      
      const client = this.clients.get(serverName);
      if (!client) {
        throw new Error(`MCP server ${serverName} not connected`);
      }
      
      // 调用工具
      const response = await client.callTool({
        name: toolName,
        arguments: arguments_ || {}
      });
      
      this.logger.info(`MCP tool call successful: ${toolName}`, { response });
      
      return {
          content: response.content as any,
          isError: Boolean(response.isError)
        };
    } catch (error) {
      this.logger.error(`Failed to call MCP tool ${toolName} on server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * 读取 MCP 资源
   */
  async readResource(serverName: string, uri: string): Promise<MCPResourceResponse> {
    try {
      this.logger.info(`Reading MCP resource: ${uri} from server: ${serverName}`);
      
      const client = this.clients.get(serverName);
      if (!client) {
        throw new Error(`MCP server ${serverName} not connected`);
      }
      
      // 读取资源
      const response = await client.readResource({ uri });
      
      this.logger.info(`MCP resource read successful: ${uri}`, { response });
      
      return {
          contents: response.contents.map(content => {
            const result: any = { uri: content.uri };
            if (content.mimeType) result.mimeType = content.mimeType;
            if (content.text) result.text = content.text;
            if (content.blob) result.blob = content.blob;
            return result;
          })
        };
    } catch (error) {
      this.logger.error(`Failed to read MCP resource ${uri} from server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * 获取连接的服务器列表
   */
  getConnectedServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  /**
   * 获取服务器的工具列表
   */
  async getServerTools(serverName: string): Promise<MCPTool[]> {
    try {
      const client = this.clients.get(serverName);
      if (!client) {
        return [];
      }
      
      const response = await client.listTools();
      return response.tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema as any,
        server: serverName,
        enabled: true
      }));
    } catch (error) {
      this.logger.error(`Failed to get tools for server ${serverName}:`, error);
      return [];
    }
  }

  /**
   * 获取服务器的资源列表
   */
  async getServerResources(serverName: string): Promise<MCPResource[]> {
    try {
      const client = this.clients.get(serverName);
      if (!client) {
        return [];
      }
      
      const response = await client.listResources();
      return response.resources.map(resource => ({
        uri: resource.uri,
        name: resource.name || resource.uri,
        description: resource.description || '',
        mimeType: resource.mimeType || 'text/plain',
        server: serverName
      }));
    } catch (error: any) {
      // 某些 MCP 服务器不支持 resources 方法，这是正常的
      if (error?.message?.includes('Method not found') || error?.message?.includes('-32601')) {
        this.logger.debug(`Server ${serverName} does not support resources method (this is normal)`);
      } else {
        this.logger.error(`Failed to get resources for server ${serverName}:`, error);
      }
      return [];
    }
  }

  /**
   * 获取所有可用工具
   */
  async getAllTools(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = [];
    
    for (const serverName of this.servers.keys()) {
      const tools = await this.getServerTools(serverName);
      allTools.push(...tools);
    }
    
    return allTools;
  }

  /**
   * 获取所有可用资源
   */
  async getAllResources(): Promise<MCPResource[]> {
    const allResources: MCPResource[] = [];
    
    for (const serverName of this.servers.keys()) {
      const resources = await this.getServerResources(serverName);
      allResources.push(...resources);
    }
    
    return allResources;
  }

  /**
   * 检查服务器是否已连接
   */
  isServerConnected(serverName: string): boolean {
    return this.servers.has(serverName) && this.clients.has(serverName);
  }

  /**
   * 获取服务器配置
   */
  getServerConfig(serverName: string): any {
    const config = this.configManager.getConfig();
    const mcpServers = (config as any).mcpServers || {};
    return mcpServers[serverName];
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    try {
      this.logger.info('Cleaning up MCP Manager');
      
      // 断开所有连接
      const serverNames = Array.from(this.servers.keys());
      for (const serverName of serverNames) {
        await this.disconnectFromServer(serverName);
      }
      
      // 清理资源
      this.servers.clear();
      this.clients.clear();
      this.processes.clear();
      this.isInitialized = false;
      
      this.logger.info('MCP Manager cleanup completed');
    } catch (error) {
      this.logger.error('Failed to cleanup MCP Manager:', error);
      throw error;
    }
  }
}