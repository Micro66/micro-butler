# Micro Butler

🤖 **Micro Butler** 是一个基于 Roo-Code 的智能编程助手后端服务，提供强大的 AI 驱动的代码生成、任务管理和自动化编程能力。

## ✨ 特性

- 🧠 **智能 AI 助手**: 基于 Anthropic Claude 的强大 AI 编程能力
- 🔧 **任务管理**: 完整的任务生命周期管理，支持暂停、恢复、中止操作
- 🌐 **WebSocket 实时通信**: 实时任务状态更新和双向通信
- 🛠️ **丰富的工具集**: 文件操作、命令执行、代码搜索等多种工具
- 📊 **任务历史**: 完整的任务执行历史记录和状态追踪
- 🔒 **安全管理**: 内置安全管理器，确保代码执行安全
- 📝 **日志系统**: 完善的日志记录和错误追踪
- 🗄️ **多存储支持**: 支持文件存储和数据库存储

## 🏗️ 架构

```
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── api/            # API 路由和 WebSocket
│   │   ├── core/           # 核心业务逻辑
│   │   │   ├── task/       # 任务管理
│   │   │   ├── api/        # API 处理
│   │   │   ├── tools/      # 工具执行器
│   │   │   ├── prompt/     # 提示词服务
│   │   │   └── security/   # 安全管理
│   │   ├── tools/          # 工具定义
│   │   ├── storage/        # 存储层
│   │   ├── types/          # 类型定义
│   │   └── utils/          # 工具函数
│   └── config/             # 配置文件
└── libs/
    └── roo-code/           # Roo-Code 核心库
```

## 🚀 快速开始

### 环境要求

- Node.js >= 18.0.0
- pnpm >= 8.0.0
- TypeScript >= 5.0.0

### 安装

```bash
# 克隆项目
git clone https://github.com/your-username/micro-butler.git
cd micro-butler

# 安装依赖
pnpm install

# 进入后端目录
cd backend
pnpm install
```

### 配置

1. 复制配置文件模板：
```bash
cp config/app.json.example config/app.json
```

2. 编辑配置文件 `config/app.json`：
```json
{
  "server": {
    "host": "localhost",
    "port": 3000
  },
  "ai": {
    "provider": "anthropic",
    "apiKey": "your-anthropic-api-key"
  },
  "storage": {
    "type": "file",
    "path": "./data"
  }
}
```

3. 设置环境变量：
```bash
# 创建 .env 文件
echo "ANTHROPIC_API_KEY=your-api-key-here" > .env
echo "LOG_LEVEL=info" >> .env
```

### 运行

```bash
# 开发模式
pnpm dev

# 构建项目
pnpm build

# 生产模式
pnpm start
```

服务将在 `http://localhost:3000` 启动。

## 📖 API 文档

### REST API

#### 创建任务
```http
POST /api/tasks
Content-Type: application/json

{
  "task": "创建一个简单的 Hello World 程序",
  "workspacePath": "/path/to/workspace"
}
```

#### 获取任务状态
```http
GET /api/tasks/{taskId}
```

#### 获取任务列表
```http
GET /api/tasks
```

### WebSocket API

连接到 WebSocket 端点：`ws://localhost:3000/ws/tasks/{taskId}`

支持的消息类型：
- `task_status_update`: 任务状态更新
- `task_message`: 任务消息
- `task_completed`: 任务完成
- `task_error`: 任务错误

## 🛠️ 开发

### 项目结构

- **Task**: 核心任务类，管理单个任务的生命周期
- **TaskManager**: 任务管理器，负责任务的创建、调度和管理
- **ToolExecutor**: 工具执行器，执行各种编程工具
- **ApiHandler**: API 处理器，与 AI 服务通信
- **PromptService**: 提示词服务，生成和管理 AI 提示词

### 添加新工具

1. 在 `src/tools/` 目录下创建新工具：
```typescript
export class MyTool {
  async execute(params: MyToolParams): Promise<ToolResult> {
    // 工具逻辑
    return { success: true, result: 'Tool executed successfully' };
  }
}
```

2. 在 `src/tools/index.ts` 中注册工具：
```typescript
export const toolGroups = {
  // ... 其他工具
  myTool: MyTool
};
```

### 运行测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试
pnpm test -- --testNamePattern="Task"

# 代码检查
pnpm lint

# 自动修复代码风格
pnpm lint:fix
```

## 📊 监控和日志

项目使用 Winston 进行日志管理，支持多种日志级别和输出格式：

- `error`: 错误信息
- `warn`: 警告信息
- `info`: 一般信息
- `debug`: 调试信息

日志配置可在 `config/app.json` 中调整。

## 🤝 贡献

我们欢迎所有形式的贡献！请查看 [贡献指南](CONTRIBUTING.md) 了解详细信息。

### 开发流程

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 [Apache 2.0 许可证](LICENSE) - 查看 LICENSE 文件了解详细信息。

## 🙏 致谢

- [Roo-Code](https://github.com/roo-code/roo-code) - 核心 AI 编程框架
- [Anthropic Claude](https://www.anthropic.com/) - AI 模型支持
- [Fastify](https://www.fastify.io/) - 高性能 Web 框架

## 📞 支持

如果您遇到任何问题或有任何建议，请：

- 创建 [Issue](https://github.com/your-username/micro-butler/issues)
- 发送邮件至：support@your-domain.com
- 加入我们的 [Discord 社区](https://discord.gg/your-invite)

---

⭐ 如果这个项目对您有帮助，请给我们一个星标！