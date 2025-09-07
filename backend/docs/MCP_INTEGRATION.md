# MCP (Model Context Protocol) 集成指南

## 概述

Micro Butler Backend 现已支持 MCP (Model Context Protocol)，允许与外部 MCP 服务器进行通信，扩展系统的工具和资源访问能力。

## 功能特性

### 🔧 MCP 工具
- **use_mcp_tool**: 调用连接的 MCP 服务器提供的工具
- **access_mcp_resource**: 访问连接的 MCP 服务器提供的资源

### 🌐 支持的传输协议
- **Stdio**: 本地进程通信
- **SSE (Server-Sent Events)**: HTTP 流式通信
- **Streamable HTTP**: HTTP 流式传输

## 配置说明

### 基础配置

在 `config/app.json` 中启用 MCP 支持：

```json
{
  "mcp": {
    "enabled": true,
    "servers": {},
    "globalConfigPath": "~/.micro-butler/mcp/servers.json",
    "projectConfigPath": "./.mcp/servers.json"
  }
}
```

### MCP 服务器配置

在 `mcpServers` 部分配置具体的 MCP 服务器：

#### Stdio 服务器示例
```json
{
  "mcpServers": {
    "weather-server": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/weather-server/index.js"],
      "env": {
        "API_KEY": "your-weather-api-key"
      },
      "disabled": false,
      "timeout": 60,
      "alwaysAllow": ["get_weather"],
      "disabledTools": []
    }
  }
}
```

#### SSE 服务器示例
```json
{
  "mcpServers": {
    "remote-api-server": {
      "type": "sse",
      "url": "https://api.example.com/mcp/sse",
      "headers": {
        "Authorization": "Bearer your-token"
      },
      "disabled": false,
      "timeout": 30,
      "alwaysAllow": [],
      "disabledTools": ["dangerous_operation"]
    }
  }
}
```

### 配置参数说明

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `type` | string | ✅ | 服务器类型：`stdio`、`sse`、`streamable-http` |
| `command` | string | ✅* | Stdio 服务器的启动命令 |
| `args` | string[] | ❌ | 命令行参数 |
| `env` | object | ❌ | 环境变量 |
| `url` | string | ✅* | SSE/HTTP 服务器的 URL |
| `headers` | object | ❌ | HTTP 请求头 |
| `disabled` | boolean | ❌ | 是否禁用服务器（默认：false） |
| `timeout` | number | ❌ | 超时时间（秒，默认：60） |
| `alwaysAllow` | string[] | ❌ | 无需确认的工具列表 |
| `disabledTools` | string[] | ❌ | 禁用的工具列表 |

*根据服务器类型，`command` 或 `url` 为必需参数

## API 使用

### 调用 MCP 工具

```typescript
// 通过 REST API
POST /tasks
{
  "task": "使用天气服务器获取旧金山的当前天气",
  "workspacePath": "/path/to/workspace"
}

// 任务执行时会自动调用相应的 MCP 工具
```

### 工具调用示例

#### use_mcp_tool
```xml
<use_mcp_tool>
<server_name>weather-server</server_name>
<tool_name>get_weather</tool_name>
<arguments>
{
  "location": "San Francisco",
  "units": "metric"
}
</arguments>
</use_mcp_tool>
```

#### access_mcp_resource
```xml
<access_mcp_resource>
<server_name>file-server</server_name>
<uri>file:///path/to/document.txt</uri>
</access_mcp_resource>
```

## 开发指南

### 创建自定义 MCP 服务器

1. **安装 MCP SDK**
```bash
npm install @modelcontextprotocol/sdk
```

2. **创建服务器**
```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  {
    name: 'my-custom-server',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {},
      resources: {}
    }
  }
);

// 注册工具
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'my_tool',
        description: 'My custom tool',
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string' }
          }
        }
      }
    ]
  };
});

// 处理工具调用
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  
  if (name === 'my_tool') {
    return {
      content: [
        {
          type: 'text',
          text: `Tool executed with input: ${args.input}`
        }
      ]
    };
  }
  
  throw new Error(`Unknown tool: ${name}`);
});

// 启动服务器
const transport = new StdioServerTransport();
server.connect(transport);
```

3. **配置服务器**
```json
{
  "mcpServers": {
    "my-custom-server": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/my-server.js"],
      "disabled": false
    }
  }
}
```

### 扩展现有工具

如需扩展 MCP 工具功能，可以修改以下文件：

- `src/tools/mcp/UseMCPTool.ts` - MCP 工具调用逻辑
- `src/tools/mcp/AccessMCPResourceTool.ts` - MCP 资源访问逻辑
- `src/core/mcp/MCPManager.ts` - MCP 连接管理

## 故障排除

### 常见问题

1. **服务器连接失败**
   - 检查服务器配置是否正确
   - 确认服务器进程是否正常启动
   - 查看日志文件获取详细错误信息

2. **工具调用失败**
   - 验证工具名称是否正确
   - 检查参数格式是否符合工具的输入模式
   - 确认工具未被禁用

3. **资源访问失败**
   - 检查 URI 格式是否正确
   - 确认资源是否存在
   - 验证访问权限

### 调试技巧

1. **启用详细日志**
```json
{
  "logging": {
    "level": "debug"
  }
}
```

2. **检查服务器状态**
```bash
# 查看服务器连接状态
curl http://localhost:3000/api/mcp/servers
```

3. **测试工具调用**
```bash
# 直接测试 MCP 工具
curl -X POST http://localhost:3000/api/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "serverName": "weather-server",
    "toolName": "get_weather",
    "arguments": {"location": "Beijing"}
  }'
```

## 安全考虑

1. **工具权限控制**
   - 使用 `alwaysAllow` 列表自动批准安全工具
   - 使用 `disabledTools` 列表禁用危险工具

2. **网络安全**
   - 对于远程 MCP 服务器，使用 HTTPS
   - 配置适当的认证头

3. **资源访问限制**
   - 限制文件系统访问路径
   - 验证 URI 格式和权限

## 性能优化

1. **连接池管理**
   - 复用 MCP 连接
   - 设置合适的超时时间

2. **缓存策略**
   - 缓存工具和资源列表
   - 实现智能重连机制

3. **监控指标**
   - 跟踪工具调用延迟
   - 监控连接状态

## 更多资源

- [MCP 官方文档](https://modelcontextprotocol.io/)
- [MCP SDK 文档](https://github.com/modelcontextprotocol/typescript-sdk)
- [示例 MCP 服务器](https://github.com/modelcontextprotocol/servers)