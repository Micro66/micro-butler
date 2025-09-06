# Roo Code Backend

一个基于 Node.js 的后端服务，提供 AI 代码助手的核心功能，支持任务管理、工具执行、实时通信等特性。

## 功能特性

- 🤖 **AI 任务管理**: 支持创建、执行、暂停、恢复和中止 AI 任务
- 🔧 **工具系统**: 内置文件系统操作、命令执行等工具组
- 🔌 **实时通信**: 基于 WebSocket 的实时任务状态更新
- 📊 **RESTful API**: 完整的 REST API 接口
- 💾 **任务持久化**: 支持任务状态和历史记录的持久化存储
- 🔒 **安全机制**: 内置权限控制和命令白名单
- 📝 **日志系统**: 完整的日志记录和管理
- ⚙️ **配置管理**: 灵活的配置系统，支持环境变量和配置文件

## 技术栈

- **运行时**: Node.js 18+
- **框架**: Fastify
- **语言**: TypeScript
- **实时通信**: Socket.IO
- **AI SDK**: Anthropic Claude API
- **日志**: Winston
- **包管理**: pnpm

## 快速开始

### 环境要求

- Node.js 18 或更高版本
- pnpm 包管理器

### 安装依赖

```bash
pnpm install
```

### 配置环境变量

创建 `.env` 文件：

```bash
# 服务器配置
PORT=3000
HOST=0.0.0.0

# API 配置
DEFAULT_API_PROVIDER=anthropic
DEFAULT_API_KEY=your_anthropic_api_key
DEFAULT_MODEL=claude-3-sonnet-20240229

# 存储配置
STORAGE_TYPE=file
STORAGE_PATH=./data

# 日志配置
LOG_LEVEL=info
```

### 启动服务

```bash
# 开发模式
pnpm dev

# 生产模式
pnpm build
pnpm start
```

### 验证服务

访问健康检查接口：

```bash
curl http://localhost:3000/health
```

## API 文档

### 任务管理

#### 创建任务

```http
POST /api/tasks
Content-Type: application/json

{
  "task": "创建一个简单的 React 组件",
  "apiConfiguration": {
    "provider": "anthropic",
    "apiKey": "your_api_key",
    "model": "claude-3-sonnet-20240229"
  }
}
```

#### 获取任务详情

```http
GET /api/tasks/{taskId}
```

#### 启动任务

```http
POST /api/tasks/{taskId}/start
```

#### 暂停任务

```http
POST /api/tasks/{taskId}/pause
```

#### 恢复任务

```http
POST /api/tasks/{taskId}/resume
```

#### 中止任务

```http
POST /api/tasks/{taskId}/abort
```

#### 获取任务列表

```http
GET /api/tasks?status=running&limit=20&offset=0
```

### WebSocket 连接

连接到 WebSocket 端点以接收实时更新：

```javascript
const socket = io('ws://localhost:3000/ws');

// 订阅任务更新
socket.emit('subscribe', { taskId: 'your-task-id' });

// 监听任务状态更新
socket.on('task_status_update', (data) => {
  console.log('Task status updated:', data);
});

// 监听任务消息
socket.on('task_message', (data) => {
  console.log('New task message:', data);
});
```

## 配置说明

### 配置文件结构

```json
{
  "server": {
    "port": 3000,
    "host": "0.0.0.0",
    "cors": {
      "origins": ["*"],
      "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      "allowedHeaders": ["Content-Type", "Authorization"]
    }
  },
  "defaultApiConfiguration": {
    "provider": "anthropic",
    "apiKey": "your_api_key",
    "model": "claude-3-sonnet-20240229",
    "maxTokens": 4096,
    "temperature": 0.7,
    "timeout": 30000
  },
  "security": {
    "enableSecurity": true,
    "allowedTools": [],
    "blockedTools": [],
    "commandWhitelist": [],
    "commandBlacklist": [],
    "allowedPaths": [],
    "blockedPaths": [],
    "enforceCommandWhitelist": false,
    "blockSensitiveDirectories": true
  },
  "storage": {
    "type": "file",
    "path": "./data",
    "maxTaskHistory": 1000,
    "cleanupInterval": 86400000
  },
  "logging": {
    "level": "info",
    "format": "json",
    "file": {
      "enabled": true,
      "path": "./logs",
      "maxSize": "10m",
      "maxFiles": 5
    },
    "console": {
      "enabled": true,
      "colorize": true
    }
  },
  "features": {
    "enableWebSocket": true,
    "enableTaskPersistence": true,
    "enableMetrics": false,
    "maxConcurrentTasks": 10,
    "taskTimeout": 1800000
  }
}
```

## 开发指南

### 项目结构

```
src/
├── api/                    # API 路由和 WebSocket
│   ├── routes/            # REST API 路由
│   └── websocket/         # WebSocket 处理
├── config/                # 配置管理
├── core/                  # 核心业务逻辑
│   ├── api/              # API 处理器
│   ├── prompt/           # 提示词服务
│   ├── security/         # 安全管理
│   └── task/             # 任务管理
├── storage/               # 数据存储
├── tools/                 # 工具系统
├── types/                 # TypeScript 类型定义
├── utils/                 # 工具函数
├── index.ts              # 应用入口
└── server.ts             # 服务器主文件
```

### 添加新工具

1. 在 `src/tools/` 目录下创建新的工具类
2. 继承 `BaseTool` 类并实现必要的方法
3. 在工具组中注册新工具

```typescript
import { BaseTool, ToolExecutionContext, ToolExecutionResult } from '../types';

class MyCustomTool extends BaseTool {
  name = 'my_custom_tool';
  description = 'Description of my custom tool';
  parameters = {
    type: 'object',
    properties: {
      // 定义参数
    },
    required: []
  };

  async execute(context: ToolExecutionContext): Promise<ToolExecutionResult> {
    // 实现工具逻辑
    return {
      success: true,
      result: 'Tool execution result'
    };
  }
}
```

### 运行测试

```bash
# 运行所有测试
pnpm test

# 运行测试并监听文件变化
pnpm test:watch

# 生成测试覆盖率报告
pnpm test:coverage
```

### 代码检查

```bash
# 运行 ESLint
pnpm lint

# 自动修复 ESLint 问题
pnpm lint:fix

# 运行 TypeScript 类型检查
pnpm type-check
```

## 部署

### Docker 部署

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]
```

### 环境变量

生产环境建议设置以下环境变量：

- `NODE_ENV=production`
- `PORT=3000`
- `DEFAULT_API_KEY=your_production_api_key`
- `STORAGE_PATH=/app/data`
- `LOG_LEVEL=warn`

## 故障排除

### 常见问题

1. **端口被占用**
   - 修改 `PORT` 环境变量或配置文件中的端口号

2. **API 密钥无效**
   - 检查 `DEFAULT_API_KEY` 环境变量是否正确设置

3. **存储权限问题**
   - 确保应用有权限访问 `STORAGE_PATH` 指定的目录

4. **内存不足**
   - 调整 `maxConcurrentTasks` 配置项限制并发任务数量

### 日志查看

```bash
# 查看应用日志
tail -f logs/app.log

# 查看错误日志
tail -f logs/app.error.log
```

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 支持

如有问题或建议，请创建 [Issue](https://github.com/your-repo/roo-code-backend/issues)。