# 基于A2A协议的Agent团队协作系统设计

## 概述

本文档描述了基于Google Agent2Agent (A2A)协议的Agent团队协作系统设计方案。该系统支持Leader Agent调度和管理Worker Agent，实现真正的多Agent协作，而不是传统的工具调用模式。<mcreference link="https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/" index="1">1</mcreference>

## 设计理念

### 核心原则

基于A2A协议的五个关键设计原则：<mcreference link="https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/" index="1">1</mcreference>

1. **拥抱Agent能力**: 支持Agent以自然、非结构化的方式协作，即使它们不共享内存、工具和上下文
2. **基于现有标准**: 构建在HTTP、SSE、JSON-RPC等流行标准之上
3. **默认安全**: 支持企业级身份验证和授权
4. **支持长时间运行任务**: 灵活支持从快速任务到需要数小时甚至数天的深度研究
5. **模态无关**: 支持文本、音频、视频流等各种模态

### Agent协作模式

- **Leader Agent**: 负责任务分解、Agent发现、任务分配和结果整合
- **Worker Agent**: 专门执行特定类型的任务，提供专业能力
- **Agent Team**: 由一个Leader和多个Worker组成的协作团队

## 系统架构

### 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    A2A Agent团队协作系统                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │   Leader Agent  │  │  Agent发现服务   │  │   任务协调器     │   │
│  │   (A2A Client)  │  │ AgentDiscovery  │  │ TaskCoordinator │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │  Worker Agent 1 │  │  Worker Agent 2 │  │  Worker Agent N │   │
│  │  (A2A Server)   │  │  (A2A Server)   │  │  (A2A Server)   │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │
│  │   Agent注册表    │  │   任务状态管理   │  │   通信管理器     │   │
│  │ AgentRegistry   │  │  TaskManager    │  │ CommManager     │   │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### A2A协议核心组件

基于A2A协议规范，系统包含以下核心组件：<mcreference link="https://a2a-protocol.org/latest/specification/" index="4">4</mcreference>

1. **Agent Card**: JSON元数据文档，描述Agent的身份、能力、技能和服务端点
2. **Message**: Client和Remote Agent之间的通信单元
3. **Task**: A2A管理的基本工作单元，具有唯一ID和状态生命周期
4. **Part**: Message或Artifact中的最小内容单元
5. **Artifact**: Agent生成的输出结果
6. **Context**: 用于逻辑分组相关任务的可选标识符

## 详细设计

### 1. Agent Card规范

每个Worker Agent必须发布Agent Card，描述其能力和服务信息：

```json
{
  "agent": {
    "id": "worker-agent-code-analysis",
    "name": "Code Analysis Agent",
    "description": "专门进行代码分析和重构建议的Agent",
    "version": "1.0.0",
    "vendor": "Micro Butler"
  },
  "capabilities": {
    "modalities": ["text", "file"],
    "languages": ["zh-CN", "en-US"],
    "streaming": true,
    "push_notifications": true
  },
  "skills": [
    {
      "name": "analyze_code",
      "description": "分析代码质量和结构",
      "parameters": {
        "type": "object",
        "properties": {
          "code": {"type": "string", "description": "要分析的代码"},
          "language": {"type": "string", "description": "编程语言"}
        },
        "required": ["code"]
      }
    },
    {
      "name": "suggest_refactoring",
      "description": "提供代码重构建议",
      "parameters": {
        "type": "object",
        "properties": {
          "code": {"type": "string", "description": "要重构的代码"},
          "focus": {"type": "string", "description": "重构重点"}
        },
        "required": ["code"]
      }
    }
  ],
  "service": {
    "transport": {
      "json_rpc": {
        "url": "https://api.micro-butler.com/agents/code-analysis",
        "methods": ["messages/send", "tasks/get", "tasks/cancel"]
      },
      "sse": {
        "url": "https://api.micro-butler.com/agents/code-analysis/stream"
      }
    },
    "authentication": {
      "type": "bearer",
      "scheme": "JWT"
    }
  },
  "extensions": {
    "micro_butler": {
      "resource_requirements": {
        "cpu": "2 cores",
        "memory": "4GB",
        "max_concurrent_tasks": 5
      },
      "specialization": "code_analysis",
      "performance_metrics": {
        "average_response_time": "2.5s",
        "success_rate": 0.98
      }
    }
  }
}
```

### 2. Leader Agent实现

#### 2.1 Agent发现和管理

```typescript
// core/agent/LeaderAgent.ts
import { A2AClient } from './A2AClient';
import { AgentCard, Task, Message } from './types';

export class LeaderAgent {
  private a2aClient: A2AClient;
  private discoveredAgents: Map<string, AgentCard> = new Map();
  private activeTasks: Map<string, Task> = new Map();
  private agentConnections: Map<string, A2AConnection> = new Map();

  constructor(a2aClient: A2AClient) {
    this.a2aClient = a2aClient;
  }

  /**
   * 发现可用的Worker Agent
   */
  async discoverAgents(): Promise<AgentCard[]> {
    try {
      // 从Agent注册表获取所有已注册的Agent
      const registeredAgents = await this.getRegisteredAgents();
      
      // 并行获取所有Agent Card
      const agentCards = await Promise.all(
        registeredAgents.map(async (agentInfo) => {
          try {
            const agentCard = await this.fetchAgentCard(agentInfo.discoveryUrl);
            this.discoveredAgents.set(agentCard.agent.id, agentCard);
            return agentCard;
          } catch (error) {
            console.warn(`Failed to fetch agent card for ${agentInfo.id}:`, error);
            return null;
          }
        })
      );
      
      return agentCards.filter(card => card !== null);
    } catch (error) {
      console.error('Failed to discover agents:', error);
      throw error;
    }
  }

  /**
   * 根据技能要求查找合适的Agent
   */
  findCapableAgents(skillName: string, requirements?: any): AgentCard[] {
    const capableAgents: AgentCard[] = [];
    
    for (const agentCard of this.discoveredAgents.values()) {
      const hasSkill = agentCard.skills.some(skill => 
        skill.name === skillName || 
        skill.description.includes(skillName)
      );
      
      if (hasSkill) {
        // 检查其他要求（如语言、模态等）
        if (this.meetsRequirements(agentCard, requirements)) {
          capableAgents.push(agentCard);
        }
      }
    }
    
    // 按性能指标排序
    return capableAgents.sort((a, b) => {
      const aPerf = a.extensions?.micro_butler?.performance_metrics?.success_rate || 0;
      const bPerf = b.extensions?.micro_butler?.performance_metrics?.success_rate || 0;
      return bPerf - aPerf;
    });
  }

  /**
   * 委托任务给Worker Agent
   */
  async delegateTask(
    agentId: string, 
    skillName: string, 
    parameters: any,
    options?: {
      streaming?: boolean;
      timeout?: number;
      priority?: 'high' | 'medium' | 'low';
    }
  ): Promise<Task> {
    const agentCard = this.discoveredAgents.get(agentId);
    if (!agentCard) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // 建立连接
    const connection = await this.getOrCreateConnection(agentCard);
    
    // 构建消息
    const message: Message = {
      role: 'user',
      parts: [
        {
          type: 'text',
          text: `请执行技能: ${skillName}`
        },
        {
          type: 'data',
          data: {
            skill: skillName,
            parameters: parameters
          }
        }
      ]
    };

    // 发送任务
    const task = await connection.sendMessage(message, {
      streaming: options?.streaming || false,
      timeout: options?.timeout || 300000 // 5分钟默认超时
    });

    this.activeTasks.set(task.id, task);
    
    // 如果支持流式响应，设置事件监听
    if (options?.streaming && agentCard.capabilities.streaming) {
      this.setupTaskStreaming(task.id, connection);
    }

    return task;
  }

  /**
   * 协调多个Agent完成复杂任务
   */
  async coordinateTeamTask(
    taskDescription: string,
    requiredSkills: string[],
    options?: {
      parallel?: boolean;
      dependencies?: Record<string, string[]>;
    }
  ): Promise<TeamTaskResult> {
    const taskPlan = await this.createTaskPlan(taskDescription, requiredSkills);
    const results: Record<string, any> = {};
    const errors: Record<string, Error> = {};

    if (options?.parallel && !options?.dependencies) {
      // 并行执行
      const tasks = await Promise.allSettled(
        taskPlan.subtasks.map(async (subtask) => {
          const agents = this.findCapableAgents(subtask.skill);
          if (agents.length === 0) {
            throw new Error(`No capable agent found for skill: ${subtask.skill}`);
          }
          
          const selectedAgent = agents[0]; // 选择最佳Agent
          return this.delegateTask(
            selectedAgent.agent.id,
            subtask.skill,
            subtask.parameters
          );
        })
      );

      // 处理结果
      tasks.forEach((result, index) => {
        const subtask = taskPlan.subtasks[index];
        if (result.status === 'fulfilled') {
          results[subtask.id] = result.value;
        } else {
          errors[subtask.id] = result.reason;
        }
      });
    } else {
      // 顺序执行或有依赖关系的执行
      for (const subtask of taskPlan.subtasks) {
        try {
          // 检查依赖是否完成
          if (options?.dependencies?.[subtask.id]) {
            const dependencies = options.dependencies[subtask.id];
            const unmetDeps = dependencies.filter(dep => !results[dep]);
            if (unmetDeps.length > 0) {
              throw new Error(`Unmet dependencies: ${unmetDeps.join(', ')}`);
            }
          }

          const agents = this.findCapableAgents(subtask.skill);
          if (agents.length === 0) {
            throw new Error(`No capable agent found for skill: ${subtask.skill}`);
          }

          const selectedAgent = agents[0];
          const task = await this.delegateTask(
            selectedAgent.agent.id,
            subtask.skill,
            {
              ...subtask.parameters,
              // 传递依赖任务的结果
              dependencies: options?.dependencies?.[subtask.id]?.reduce((acc, dep) => {
                acc[dep] = results[dep];
                return acc;
              }, {} as Record<string, any>)
            }
          );

          // 等待任务完成
          const result = await this.waitForTaskCompletion(task.id);
          results[subtask.id] = result;
        } catch (error) {
          errors[subtask.id] = error as Error;
          
          // 根据错误处理策略决定是否继续
          if (subtask.critical) {
            break; // 关键任务失败，停止执行
          }
        }
      }
    }

    return {
      taskId: taskPlan.id,
      results,
      errors,
      summary: await this.generateTaskSummary(results, errors)
    };
  }

  private async fetchAgentCard(discoveryUrl: string): Promise<AgentCard> {
    const response = await fetch(`${discoveryUrl}/.well-known/agent.json`);
    if (!response.ok) {
      throw new Error(`Failed to fetch agent card: ${response.statusText}`);
    }
    return response.json();
  }

  private async getOrCreateConnection(agentCard: AgentCard): Promise<A2AConnection> {
    const agentId = agentCard.agent.id;
    
    if (this.agentConnections.has(agentId)) {
      return this.agentConnections.get(agentId)!;
    }

    const connection = new A2AConnection(agentCard);
    await connection.connect();
    
    this.agentConnections.set(agentId, connection);
    return connection;
  }

  private async createTaskPlan(
    taskDescription: string, 
    requiredSkills: string[]
  ): Promise<TaskPlan> {
    // 使用AI规划器分解任务
    // 这里可以集成现有的任务规划逻辑
    return {
      id: `task_${Date.now()}`,
      description: taskDescription,
      subtasks: requiredSkills.map((skill, index) => ({
        id: `subtask_${index}`,
        skill,
        parameters: {},
        critical: true
      }))
    };
  }
}
```

#### 2.2 A2A连接管理

```typescript
// core/agent/A2AConnection.ts
import { EventSource } from 'eventsource';

export class A2AConnection {
  private agentCard: AgentCard;
  private httpClient: HttpClient;
  private sseConnection?: EventSource;
  private isConnected: boolean = false;

  constructor(agentCard: AgentCard) {
    this.agentCard = agentCard;
    this.httpClient = new HttpClient({
      baseURL: agentCard.service.transport.json_rpc?.url,
      timeout: 30000,
      headers: this.buildAuthHeaders()
    });
  }

  async connect(): Promise<void> {
    try {
      // 测试连接
      await this.ping();
      
      // 建立SSE连接（如果支持）
      if (this.agentCard.service.transport.sse) {
        await this.setupSSEConnection();
      }
      
      this.isConnected = true;
    } catch (error) {
      throw new Error(`Failed to connect to agent ${this.agentCard.agent.id}: ${error.message}`);
    }
  }

  async sendMessage(message: Message, options?: SendOptions): Promise<Task> {
    if (!this.isConnected) {
      throw new Error('Connection not established');
    }

    const request = {
      jsonrpc: '2.0',
      method: 'messages/send',
      params: {
        message,
        options: {
          streaming: options?.streaming || false,
          timeout: options?.timeout || 300000
        }
      },
      id: this.generateRequestId()
    };

    const response = await this.httpClient.post('/', request);
    
    if (response.data.error) {
      throw new Error(`Agent error: ${response.data.error.message}`);
    }

    return response.data.result.task;
  }

  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    const request = {
      jsonrpc: '2.0',
      method: 'tasks/get',
      params: { task_id: taskId },
      id: this.generateRequestId()
    };

    const response = await this.httpClient.post('/', request);
    return response.data.result;
  }

  async cancelTask(taskId: string): Promise<void> {
    const request = {
      jsonrpc: '2.0',
      method: 'tasks/cancel',
      params: { task_id: taskId },
      id: this.generateRequestId()
    };

    await this.httpClient.post('/', request);
  }

  private async setupSSEConnection(): Promise<void> {
    const sseUrl = this.agentCard.service.transport.sse?.url;
    if (!sseUrl) return;

    this.sseConnection = new EventSource(sseUrl, {
      headers: this.buildAuthHeaders()
    });

    this.sseConnection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleSSEMessage(data);
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    this.sseConnection.onerror = (error) => {
      console.error('SSE connection error:', error);
    };
  }

  private buildAuthHeaders(): Record<string, string> {
    const auth = this.agentCard.service.authentication;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (auth?.type === 'bearer') {
      // 这里需要实现JWT token获取逻辑
      headers['Authorization'] = `Bearer ${this.getAuthToken()}`;
    }

    return headers;
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 3. Worker Agent实现

#### 3.1 A2A服务器基础框架

```typescript
// core/agent/WorkerAgent.ts
import { FastifyInstance } from 'fastify';
import { A2AServer } from './A2AServer';

export class WorkerAgent extends A2AServer {
  private skills: Map<string, SkillHandler> = new Map();
  private activeTasks: Map<string, TaskExecution> = new Map();

  constructor(
    agentId: string,
    agentName: string,
    description: string,
    capabilities: AgentCapabilities
  ) {
    super(agentId, agentName, description, capabilities);
  }

  /**
   * 注册技能处理器
   */
  registerSkill(skillName: string, handler: SkillHandler): void {
    this.skills.set(skillName, handler);
    
    // 更新Agent Card
    this.updateAgentCard({
      skills: Array.from(this.skills.entries()).map(([name, handler]) => ({
        name,
        description: handler.description,
        parameters: handler.parameters
      }))
    });
  }

  /**
   * 处理消息
   */
  protected async handleMessage(message: Message, context: RequestContext): Promise<TaskResult> {
    try {
      // 解析消息中的技能请求
      const skillRequest = this.parseSkillRequest(message);
      
      if (!skillRequest) {
        throw new Error('Invalid skill request format');
      }

      const { skillName, parameters } = skillRequest;
      const skillHandler = this.skills.get(skillName);
      
      if (!skillHandler) {
        throw new Error(`Skill not found: ${skillName}`);
      }

      // 创建任务执行上下文
      const taskExecution: TaskExecution = {
        id: context.taskId,
        skillName,
        parameters,
        startTime: Date.now(),
        status: 'running',
        progress: 0
      };
      
      this.activeTasks.set(context.taskId, taskExecution);

      // 执行技能
      const result = await this.executeSkill(skillHandler, parameters, context);
      
      // 更新任务状态
      taskExecution.status = 'completed';
      taskExecution.endTime = Date.now();
      taskExecution.result = result;

      return {
        success: true,
        artifacts: result.artifacts || [],
        metadata: {
          executionTime: taskExecution.endTime - taskExecution.startTime,
          skillName,
          agentId: this.agentId
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        metadata: {
          agentId: this.agentId,
          errorType: error.constructor.name
        }
      };
    }
  }

  private async executeSkill(
    handler: SkillHandler, 
    parameters: any, 
    context: RequestContext
  ): Promise<SkillResult> {
    // 验证参数
    this.validateParameters(parameters, handler.parameters);
    
    // 执行技能处理器
    const result = await handler.execute(parameters, {
      taskId: context.taskId,
      agentId: this.agentId,
      updateProgress: (progress: number) => {
        this.updateTaskProgress(context.taskId, progress);
      },
      sendPartialResult: (artifact: Artifact) => {
        this.sendPartialResult(context.taskId, artifact);
      }
    });

    return result;
  }

  private parseSkillRequest(message: Message): SkillRequest | null {
    // 查找包含技能请求的Part
    for (const part of message.parts) {
      if (part.type === 'data' && part.data?.skill) {
        return {
          skillName: part.data.skill,
          parameters: part.data.parameters || {}
        };
      }
      
      if (part.type === 'text') {
        // 尝试从文本中解析技能请求
        const match = part.text.match(/请执行技能:\s*(\w+)/);
        if (match) {
          return {
            skillName: match[1],
            parameters: {}
          };
        }
      }
    }
    
    return null;
  }
}
```

#### 3.2 具体Worker Agent示例

```typescript
// agents/CodeAnalysisAgent.ts
export class CodeAnalysisAgent extends WorkerAgent {
  constructor() {
    super(
      'code-analysis-agent',
      'Code Analysis Agent',
      '专门进行代码分析和重构建议的Agent',
      {
        modalities: ['text', 'file'],
        languages: ['zh-CN', 'en-US'],
        streaming: true,
        push_notifications: true
      }
    );

    this.registerSkills();
  }

  private registerSkills(): void {
    // 注册代码分析技能
    this.registerSkill('analyze_code', {
      description: '分析代码质量和结构',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '要分析的代码' },
          language: { type: 'string', description: '编程语言' },
          focus: { 
            type: 'array', 
            items: { type: 'string' },
            description: '分析重点：complexity, security, performance, maintainability'
          }
        },
        required: ['code']
      },
      execute: async (params, context) => {
        const { code, language = 'javascript', focus = ['complexity', 'maintainability'] } = params;
        
        context.updateProgress(10);
        
        // 执行代码分析
        const analysisResults = await this.performCodeAnalysis(code, language, focus);
        
        context.updateProgress(80);
        
        // 生成报告
        const report = await this.generateAnalysisReport(analysisResults);
        
        context.updateProgress(100);
        
        return {
          artifacts: [
            {
              type: 'data',
              data: {
                analysis: analysisResults,
                report: report,
                metrics: {
                  complexity_score: analysisResults.complexity,
                  maintainability_index: analysisResults.maintainability,
                  security_issues: analysisResults.security_issues.length
                }
              }
            },
            {
              type: 'text',
              text: `代码分析完成。复杂度评分: ${analysisResults.complexity}/10，可维护性指数: ${analysisResults.maintainability}/100`
            }
          ]
        };
      }
    });

    // 注册重构建议技能
    this.registerSkill('suggest_refactoring', {
      description: '提供代码重构建议',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '要重构的代码' },
          focus: { type: 'string', description: '重构重点' },
          constraints: {
            type: 'object',
            properties: {
              preserve_functionality: { type: 'boolean', default: true },
              max_changes: { type: 'number', default: 10 }
            }
          }
        },
        required: ['code']
      },
      execute: async (params, context) => {
        const { code, focus = 'readability', constraints = {} } = params;
        
        context.updateProgress(20);
        
        // 分析当前代码
        const currentAnalysis = await this.performCodeAnalysis(code, 'javascript', [focus]);
        
        context.updateProgress(50);
        
        // 生成重构建议
        const suggestions = await this.generateRefactoringSuggestions(
          code, 
          currentAnalysis, 
          focus, 
          constraints
        );
        
        context.updateProgress(80);
        
        // 应用建议生成重构后的代码
        const refactoredCode = await this.applyRefactoringSuggestions(code, suggestions);
        
        context.updateProgress(100);
        
        return {
          artifacts: [
            {
              type: 'data',
              data: {
                original_code: code,
                refactored_code: refactoredCode,
                suggestions: suggestions,
                improvements: {
                  before: currentAnalysis,
                  after: await this.performCodeAnalysis(refactoredCode, 'javascript', [focus])
                }
              }
            },
            {
              type: 'text',
              text: `重构建议已生成，共提供 ${suggestions.length} 项改进建议`
            }
          ]
        };
      }
    });
  }

  private async performCodeAnalysis(code: string, language: string, focus: string[]): Promise<any> {
    // 实现代码分析逻辑
    // 这里可以集成现有的代码分析工具
    return {
      complexity: 6,
      maintainability: 75,
      security_issues: [],
      performance_issues: [],
      code_smells: []
    };
  }

  private async generateAnalysisReport(analysis: any): Promise<string> {
    // 生成分析报告
    return `代码分析报告：\n复杂度: ${analysis.complexity}/10\n可维护性: ${analysis.maintainability}/100`;
  }

  private async generateRefactoringSuggestions(
    code: string, 
    analysis: any, 
    focus: string, 
    constraints: any
  ): Promise<any[]> {
    // 生成重构建议
    return [
      {
        type: 'extract_method',
        description: '提取重复代码为方法',
        impact: 'medium',
        effort: 'low'
      }
    ];
  }

  private async applyRefactoringSuggestions(code: string, suggestions: any[]): Promise<string> {
    // 应用重构建议
    return code; // 简化实现
  }
}
```

### 4. 任务协调和状态管理

#### 4.1 任务协调器

```typescript
// core/coordination/TaskCoordinator.ts
export class TaskCoordinator {
  private leaderAgent: LeaderAgent;
  private taskExecutions: Map<string, TeamTaskExecution> = new Map();
  private eventBus: EventBus;

  constructor(leaderAgent: LeaderAgent, eventBus: EventBus) {
    this.leaderAgent = leaderAgent;
    this.eventBus = eventBus;
  }

  /**
   * 执行团队任务
   */
  async executeTeamTask(request: TeamTaskRequest): Promise<TeamTaskResult> {
    const execution: TeamTaskExecution = {
      id: `team_task_${Date.now()}`,
      request,
      status: 'planning',
      startTime: Date.now(),
      subtasks: [],
      results: {},
      errors: {}
    };

    this.taskExecutions.set(execution.id, execution);

    try {
      // 1. 任务规划阶段
      execution.status = 'planning';
      const taskPlan = await this.planTask(request);
      execution.plan = taskPlan;

      // 2. Agent发现和分配阶段
      execution.status = 'agent_discovery';
      const agentAssignments = await this.assignAgents(taskPlan);
      execution.agentAssignments = agentAssignments;

      // 3. 任务执行阶段
      execution.status = 'executing';
      const results = await this.executeSubtasks(taskPlan, agentAssignments, execution);
      execution.results = results.results;
      execution.errors = results.errors;

      // 4. 结果整合阶段
      execution.status = 'integrating';
      const finalResult = await this.integrateResults(execution);
      
      execution.status = 'completed';
      execution.endTime = Date.now();
      execution.finalResult = finalResult;

      return finalResult;
    } catch (error) {
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.error = error.message;
      throw error;
    }
  }

  private async planTask(request: TeamTaskRequest): Promise<TaskPlan> {
    // 使用AI规划器分解复杂任务
    const planningPrompt = `
      请将以下任务分解为可以由专门的Agent执行的子任务：
      任务描述: ${request.description}
      可用技能: ${request.availableSkills?.join(', ') || '自动发现'}
      
      请返回JSON格式的任务计划，包含：
      - 子任务列表
      - 每个子任务需要的技能
      - 子任务之间的依赖关系
      - 执行顺序建议
    `;

    // 这里可以调用现有的AI规划服务
    const planningResult = await this.callPlanningService(planningPrompt);
    
    return {
      id: `plan_${Date.now()}`,
      description: request.description,
      subtasks: planningResult.subtasks,
      dependencies: planningResult.dependencies,
      executionStrategy: planningResult.executionStrategy || 'sequential'
    };
  }

  private async assignAgents(plan: TaskPlan): Promise<AgentAssignment[]> {
    const assignments: AgentAssignment[] = [];

    for (const subtask of plan.subtasks) {
      // 查找能够执行该子任务的Agent
      const capableAgents = this.leaderAgent.findCapableAgents(
        subtask.requiredSkill,
        subtask.requirements
      );

      if (capableAgents.length === 0) {
        throw new Error(`No capable agent found for skill: ${subtask.requiredSkill}`);
      }

      // 选择最佳Agent（基于性能指标、当前负载等）
      const selectedAgent = await this.selectBestAgent(capableAgents, subtask);
      
      assignments.push({
        subtaskId: subtask.id,
        agentId: selectedAgent.agent.id,
        agentCard: selectedAgent,
        estimatedDuration: this.estimateTaskDuration(subtask, selectedAgent)
      });
    }

    return assignments;
  }

  private async executeSubtasks(
    plan: TaskPlan,
    assignments: AgentAssignment[],
    execution: TeamTaskExecution
  ): Promise<{ results: Record<string, any>; errors: Record<string, Error> }> {
    const results: Record<string, any> = {};
    const errors: Record<string, Error> = {};

    if (plan.executionStrategy === 'parallel') {
      // 并行执行
      const tasks = assignments.map(async (assignment) => {
        try {
          const subtask = plan.subtasks.find(st => st.id === assignment.subtaskId)!;
          const result = await this.leaderAgent.delegateTask(
            assignment.agentId,
            subtask.requiredSkill,
            subtask.parameters,
            {
              streaming: true,
              timeout: assignment.estimatedDuration * 2 // 2倍预估时间作为超时
            }
          );
          
          const taskResult = await this.leaderAgent.waitForTaskCompletion(result.id);
          results[assignment.subtaskId] = taskResult;
        } catch (error) {
          errors[assignment.subtaskId] = error as Error;
        }
      });

      await Promise.allSettled(tasks);
    } else {
      // 顺序执行（考虑依赖关系）
      const executionOrder = this.calculateExecutionOrder(plan);
      
      for (const subtaskId of executionOrder) {
        try {
          // 检查依赖是否满足
          const dependencies = plan.dependencies?.[subtaskId] || [];
          const unmetDeps = dependencies.filter(dep => !results[dep] && !errors[dep]);
          
          if (unmetDeps.length > 0) {
            throw new Error(`Unmet dependencies: ${unmetDeps.join(', ')}`);
          }

          const assignment = assignments.find(a => a.subtaskId === subtaskId)!;
          const subtask = plan.subtasks.find(st => st.id === subtaskId)!;
          
          // 准备参数（包含依赖任务的结果）
          const enhancedParameters = {
            ...subtask.parameters,
            dependencies: dependencies.reduce((acc, dep) => {
              if (results[dep]) {
                acc[dep] = results[dep];
              }
              return acc;
            }, {} as Record<string, any>)
          };

          const result = await this.leaderAgent.delegateTask(
            assignment.agentId,
            subtask.requiredSkill,
            enhancedParameters,
            {
              streaming: true,
              timeout: assignment.estimatedDuration * 2
            }
          );
          
          const taskResult = await this.leaderAgent.waitForTaskCompletion(result.id);
          results[subtaskId] = taskResult;
          
          // 发布进度事件
          await this.eventBus.publish({
            id: `subtask_completed_${Date.now()}`,
            type: 'team_task.subtask_completed',
            source: 'TaskCoordinator',
            timestamp: Date.now(),
            data: {
              teamTaskId: execution.id,
              subtaskId,
              result: taskResult
            },
            severity: 'info'
          });
        } catch (error) {
          errors[subtaskId] = error as Error;
          
          // 根据错误处理策略决定是否继续
          const subtask = plan.subtasks.find(st => st.id === subtaskId)!;
          if (subtask.critical) {
            break; // 关键任务失败，停止执行
          }
        }
      }
    }

    return { results, errors };
  }

  private async integrateResults(execution: TeamTaskExecution): Promise<TeamTaskResult> {
    // 整合所有子任务的结果
    const successfulResults = Object.entries(execution.results)
      .filter(([_, result]) => result.success)
      .map(([subtaskId, result]) => ({ subtaskId, result }));

    const failedResults = Object.entries(execution.errors)
      .map(([subtaskId, error]) => ({ subtaskId, error: error.message }));

    // 生成最终报告
    const summary = await this.generateTaskSummary(
      execution.request.description,
      successfulResults,
      failedResults
    );

    return {
      teamTaskId: execution.id,
      success: failedResults.length === 0,
      summary,
      results: execution.results,
      errors: execution.errors,
      metrics: {
        totalSubtasks: execution.plan!.subtasks.length,
        successfulSubtasks: successfulResults.length,
        failedSubtasks: failedResults.length,
        executionTime: execution.endTime! - execution.startTime,
        agentsUsed: execution.agentAssignments!.length
      }
    };
  }
}
```

### 5. 配置和部署

#### 5.1 系统配置

```json
{
  "a2a": {
    "enabled": true,
    "leader_agent": {
      "id": "micro-butler-leader",
      "name": "Micro Butler Leader Agent",
      "description": "负责任务分解和Agent协调的主控Agent",
      "discovery": {
        "registry_url": "https://api.micro-butler.com/agents/registry",
        "refresh_interval": 300000,
        "cache_ttl": 600000
      },
      "coordination": {
        "max_concurrent_tasks": 10,
        "task_timeout": 1800000,
        "retry_policy": {
          "max_retries": 3,
          "backoff_multiplier": 2
        }
      }
    },
    "worker_agents": {
      "code_analysis": {
        "enabled": true,
        "endpoint": "https://api.micro-butler.com/agents/code-analysis",
        "max_concurrent_tasks": 5,
        "specializations": ["javascript", "typescript", "python", "java"]
      },
      "file_operations": {
        "enabled": true,
        "endpoint": "https://api.micro-butler.com/agents/file-ops",
        "max_concurrent_tasks": 3,
        "allowed_paths": ["/workspace", "/tmp"]
      },
      "web_search": {
        "enabled": true,
        "endpoint": "https://api.micro-butler.com/agents/web-search",
        "max_concurrent_tasks": 2,
        "rate_limits": {
          "requests_per_minute": 30
        }
      }
    },
    "security": {
      "authentication": {
        "type": "jwt",
        "issuer": "micro-butler",
        "audience": "a2a-agents",
        "token_ttl": 3600
      },
      "authorization": {
        "enabled": true,
        "default_permissions": ["read", "execute"],
        "admin_permissions": ["read", "write", "execute", "admin"]
      }
    },
    "monitoring": {
      "enabled": true,
      "metrics_collection": {
        "interval": 30000,
        "retention": "7d"
      },
      "health_checks": {
        "interval": 60000,
        "timeout": 10000
      },
      "alerts": {
        "agent_offline": {
          "threshold": "2m",
          "severity": "high"
        },
        "task_failure_rate": {
          "threshold": 0.1,
          "window": "5m",
          "severity": "medium"
        }
      }
    }
  }
}
```

#### 5.2 Docker部署配置

```dockerfile
# Dockerfile.leader-agent
FROM node:18-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --only=production

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# 启动应用
CMD ["npm", "start"]
```

```dockerfile
# Dockerfile.worker-agent
FROM node:18-alpine

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --only=production

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

# 暴露端口
EXPOSE 3001

# 创建Agent Card
RUN mkdir -p /app/public/.well-known
COPY agent-card.json /app/public/.well-known/agent.json

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/.well-known/agent.json || exit 1

# 启动应用
CMD ["npm", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  leader-agent:
    build:
      context: .
      dockerfile: Dockerfile.leader-agent
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - A2A_LEADER_MODE=true
      - AGENT_REGISTRY_URL=http://agent-registry:3002
    depends_on:
      - agent-registry
      - redis
      - postgres
    networks:
      - a2a-network

  code-analysis-agent:
    build:
      context: ./agents/code-analysis
      dockerfile: Dockerfile.worker-agent
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - AGENT_ID=code-analysis-agent
      - AGENT_NAME=Code Analysis Agent
      - REGISTRY_URL=http://agent-registry:3002
    depends_on:
      - agent-registry
    networks:
      - a2a-network

  file-operations-agent:
    build:
      context: ./agents/file-operations
      dockerfile: Dockerfile.worker-agent
    ports:
      - "3003:3001"
    environment:
      - NODE_ENV=production
      - AGENT_ID=file-operations-agent
      - AGENT_NAME=File Operations Agent
      - REGISTRY_URL=http://agent-registry:3002
    volumes:
      - ./workspace:/workspace:rw
    depends_on:
      - agent-registry
    networks:
      - a2a-network

  agent-registry:
    build:
      context: ./registry
    ports:
      - "3002:3002"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:password@postgres:5432/agent_registry
    depends_on:
      - postgres
    networks:
      - a2a-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    networks:
      - a2a-network

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=agent_registry
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - a2a-network

volumes:
  postgres_data:

networks:
  a2a-network:
    driver: bridge
```

## 与现有系统的集成

### 架构集成模式

**不是两个独立的模型，而是在现有backend基础上的扩展和重构：**

#### 1. 现有系统保持 (backend/)
- 保留现有的Task、TaskManager、ToolExecutor等核心组件
- 保留现有的API路由和WebSocket通信
- 保留现有的存储和配置系统
- 保留现有的MCP协议支持

#### 2. 扩展A2A协议支持
在现有backend中添加新的模块：

```
backend/src/
├── core/
│   ├── task/           # 现有任务系统
│   ├── mcp/            # 现有MCP协议支持
│   ├── a2a/            # 新增A2A协议支持
│   │   ├── LeaderAgent.ts
│   │   ├── A2AClient.ts
│   │   ├── A2AConnection.ts
│   │   └── TaskCoordinator.ts
│   ├── agents/         # 新增Agent管理
│   │   ├── AgentRegistry.ts
│   │   ├── WorkerAgent.ts
│   │   └── A2AServer.ts
│   └── tools/          # 现有工具系统
├── agents/             # 新增专业化Agent目录
│   ├── code-analysis/
│   ├── file-operations/
│   └── web-search/
```

#### 3. 集成方式

**Leader Agent集成到现有Task系统：**
- 现有的Task类可以选择使用传统工具或A2A Agent团队
- TaskManager可以根据任务复杂度自动选择执行模式
- 保持向后兼容，现有功能不受影响

**Worker Agent作为独立服务：**
- 可以部署为独立的微服务
- 也可以在同一个backend进程中运行
- 通过A2A协议与Leader Agent通信

#### 4. 部署模式

**单体模式**：所有Agent在同一个backend进程中
**微服务模式**：Leader Agent在backend，Worker Agent独立部署
**混合模式**：核心Agent在backend，专业Agent独立部署

### 现有功能迁移策略

#### MCP工具转换为Worker Agent
现有的MCP工具可以逐步转换为Worker Agent：

1. **文件操作工具** → **文件操作Agent**
   - 将现有的文件读写、搜索等工具封装为Agent技能
   - 支持更复杂的文件处理流程

2. **命令执行工具** → **系统操作Agent**
   - 将命令执行能力封装为Agent
   - 支持复杂的系统管理任务

3. **代码分析工具** → **代码分析Agent**
   - 整合现有的代码搜索、分析功能
   - 提供更智能的代码理解和重构建议

#### 任务执行模式选择
```typescript
// 在现有Task类中添加执行模式选择
export class Task {
  private executionMode: 'traditional' | 'a2a_team' = 'traditional';
  
  async executeTask(task: string): Promise<void> {
    if (this.shouldUseA2ATeam(task)) {
      this.executionMode = 'a2a_team';
      await this.executeWithA2ATeam(task);
    } else {
      this.executionMode = 'traditional';
      await this.executeWithTraditionalTools(task);
    }
  }
  
  private shouldUseA2ATeam(task: string): boolean {
    // 根据任务复杂度、所需技能数量等判断
    const complexity = this.analyzeTaskComplexity(task);
    const requiredSkills = this.extractRequiredSkills(task);
    
    return complexity > 5 || requiredSkills.length > 3;
  }
}
```

## 详细实施计划

### 阶段1: A2A协议基础实现 (3-4周)

#### 第1周：协议基础组件
- [ ] **A2A协议核心类型定义**
  - 在 `backend/src/types/` 中添加A2A相关类型
  - AgentCard、Message、Task、Part、Artifact等接口定义
  - 与现有类型系统集成

- [ ] **JSON-RPC 2.0传输层实现**
  - 实现 `backend/src/core/a2a/transport/JsonRpcTransport.ts`
  - 支持HTTP和WebSocket传输
  - 错误处理和重试机制

#### 第2周：Agent Card和发现机制
- [ ] **Agent Card规范实现**
  - 实现 `backend/src/core/a2a/AgentCard.ts`
  - Agent能力描述和验证
  - 动态Agent Card生成

- [ ] **Agent发现服务**
  - 实现 `backend/src/core/agents/AgentDiscovery.ts`
  - 支持本地和远程Agent发现
  - 缓存和刷新机制

#### 第3周：基础通信框架
- [ ] **A2A客户端实现**
  - 实现 `backend/src/core/a2a/A2AClient.ts`
  - 连接管理和消息发送
  - 流式响应处理

- [ ] **A2A服务器框架**
  - 实现 `backend/src/core/a2a/A2AServer.ts`
  - 消息路由和处理
  - 任务状态管理

#### 第4周：集成测试和优化
- [ ] **基础通信测试**
  - Leader-Worker基础通信测试
  - 错误处理和恢复测试
  - 性能基准测试

### 阶段2: Agent团队协作框架 (4-5周)

#### 第5-6周：Leader Agent核心功能
- [ ] **Leader Agent实现**
  - 实现 `backend/src/core/a2a/LeaderAgent.ts`
  - Agent发现和能力匹配
  - 任务分解和分配逻辑

- [ ] **任务协调器**
  - 实现 `backend/src/core/a2a/TaskCoordinator.ts`
  - 并行和顺序执行策略
  - 依赖关系管理

#### 第7-8周：Worker Agent基础框架
- [ ] **Worker Agent基类**
  - 实现 `backend/src/core/agents/WorkerAgent.ts`
  - 技能注册和管理
  - 消息处理框架

- [ ] **Agent注册表服务**
  - 实现 `backend/src/core/agents/AgentRegistry.ts`
  - Agent生命周期管理
  - 健康检查和负载均衡

#### 第9周：与现有系统集成
- [ ] **Task系统集成**
  - 修改现有Task类支持A2A模式
  - 执行模式自动选择逻辑
  - 向后兼容性保证

- [ ] **API路由扩展**
  - 在 `backend/src/api/routes/` 中添加Agent管理API
  - WebSocket支持Agent状态推送
  - 现有API保持不变

### 阶段3: 具体Agent实现 (3-4周)

#### 第10周：代码分析Agent
- [ ] **代码分析Agent开发**
  - 实现 `backend/src/agents/code-analysis/CodeAnalysisAgent.ts`
  - 集成现有代码搜索和分析工具
  - 支持多种编程语言

- [ ] **技能实现**
  - `analyze_code`: 代码质量分析
  - `suggest_refactoring`: 重构建议
  - `find_patterns`: 代码模式识别

#### 第11周：文件操作Agent
- [ ] **文件操作Agent开发**
  - 实现 `backend/src/agents/file-operations/FileOperationsAgent.ts`
  - 迁移现有文件工具功能
  - 增强文件处理能力

- [ ] **技能实现**
  - `read_files`: 智能文件读取
  - `write_files`: 批量文件写入
  - `search_files`: 高级文件搜索
  - `organize_files`: 文件整理和分类

#### 第12周：Web搜索Agent
- [ ] **Web搜索Agent开发**
  - 实现 `backend/src/agents/web-search/WebSearchAgent.ts`
  - 集成多个搜索引擎
  - 结果过滤和排序

- [ ] **技能实现**
  - `web_search`: 网络搜索
  - `extract_content`: 内容提取
  - `summarize_results`: 结果摘要

#### 第13周：系统操作Agent
- [ ] **系统操作Agent开发**
  - 实现 `backend/src/agents/system-ops/SystemOpsAgent.ts`
  - 迁移现有命令执行功能
  - 增强系统管理能力

- [ ] **技能实现**
  - `execute_commands`: 安全命令执行
  - `monitor_system`: 系统监控
  - `manage_processes`: 进程管理

### 阶段4: 高级功能和优化 (3-4周)

#### 第14周：流式响应和推送通知
- [ ] **Server-Sent Events实现**
  - 实现实时任务状态推送
  - 流式结果传输
  - 客户端断线重连

- [ ] **推送通知系统**
  - Webhook支持
  - 消息队列集成
  - 通知去重和限流

#### 第15周：任务依赖和并行执行
- [ ] **依赖关系管理**
  - 任务依赖图构建
  - 循环依赖检测
  - 动态依赖解析

- [ ] **并行执行优化**
  - 资源池管理
  - 负载均衡算法
  - 故障转移机制

#### 第16周：性能监控和优化
- [ ] **监控指标收集**
  - Agent性能指标
  - 任务执行统计
  - 资源使用监控

- [ ] **性能优化**
  - 连接池优化
  - 缓存策略改进
  - 内存使用优化

#### 第17周：智能调度算法
- [ ] **调度策略实现**
  - 基于负载的调度
  - 基于能力匹配的调度
  - 学习型调度算法

- [ ] **故障恢复机制**
  - 自动重试策略
  - 任务迁移
  - 降级处理

### 阶段5: 安全和部署 (2-3周)

#### 第18周：安全机制实现
- [ ] **身份验证和授权**
  - JWT token管理
  - Agent身份验证
  - 权限控制系统

- [ ] **安全通信**
  - TLS/SSL支持
  - 消息加密
  - 安全审计日志

#### 第19周：容器化部署
- [ ] **Docker镜像构建**
  - Leader Agent镜像
  - Worker Agent镜像
  - 多架构支持

- [ ] **Kubernetes编排**
  - Deployment配置
  - Service发现
  - 自动扩缩容

#### 第20周：监控和运维工具
- [ ] **监控仪表板**
  - Grafana集成
  - 实时指标展示
  - 告警规则配置

- [ ] **运维工具**
  - 健康检查端点
  - 配置热更新
  - 日志聚合

### 里程碑和交付物

#### 里程碑1 (第4周末)：A2A协议基础完成
- [ ] A2A协议核心组件可用
- [ ] 基础Leader-Worker通信建立
- [ ] 单元测试覆盖率 > 80%

#### 里程碑2 (第9周末)：Agent框架完成
- [ ] Leader Agent和Worker Agent框架完成
- [ ] 与现有Task系统集成完成
- [ ] 基础Agent注册和发现功能可用

#### 里程碑3 (第13周末)：核心Agent实现完成
- [ ] 3-4个核心Worker Agent实现完成
- [ ] 基本的团队协作功能可用
- [ ] 集成测试通过

#### 里程碑4 (第17周末)：高级功能完成
- [ ] 流式响应和并行执行功能完成
- [ ] 性能监控和优化完成
- [ ] 系统稳定性测试通过

#### 里程碑5 (第20周末)：生产就绪
- [ ] 安全机制完成
- [ ] 容器化部署完成
- [ ] 监控和运维工具完成
- [ ] 生产环境部署测试通过

### 风险评估和缓解策略

#### 技术风险
1. **A2A协议复杂性**
   - 风险：协议实现复杂，可能影响进度
   - 缓解：分阶段实现，先实现核心功能

2. **现有系统集成**
   - 风险：与现有系统集成可能出现兼容性问题
   - 缓解：保持向后兼容，渐进式迁移

3. **性能影响**
   - 风险：Agent间通信可能影响系统性能
   - 缓解：性能测试和优化，连接池管理

#### 资源风险
1. **开发时间**
   - 风险：20周开发周期较长
   - 缓解：并行开发，MVP优先

2. **团队技能**
   - 风险：团队对A2A协议不熟悉
   - 缓解：技术培训，原型验证

### 成功标准

#### 功能标准
- [ ] 支持至少3种不同类型的Worker Agent
- [ ] 支持复杂任务的自动分解和协调
- [ ] 支持并行和顺序执行模式
- [ ] 与现有系统100%向后兼容

#### 性能标准
- [ ] Agent间通信延迟 < 100ms
- [ ] 任务调度延迟 < 200ms
- [ ] 系统吞吐量不低于现有系统的90%
- [ ] 内存使用增长 < 30%

#### 质量标准
- [ ] 单元测试覆盖率 > 85%
- [ ] 集成测试覆盖率 > 70%
- [ ] 代码质量评分 > 8.0/10
- [ ] 安全扫描无高危漏洞

## 技术优势

### 1. 标准化协作
- 基于开放标准的A2A协议<mcreference link="https://github.com/a2aproject/A2A" index="2">2</mcreference>
- 支持跨框架、跨厂商的Agent互操作
- 企业级安全和认证支持

### 2. 真正的Agent协作
- Agent作为独立实体而非工具进行协作<mcreference link="https://developers.googleblog.com/en/a2a-a-new-era-of-agent-interoperability/" index="1">1</mcreference>
- 支持复杂的多轮对话和协商
- 保持Agent内部状态和逻辑的不透明性

### 3. 灵活的交互模式
- 支持同步请求/响应、流式更新和异步推送通知<mcreference link="https://a2a-protocol.org/latest/specification/" index="4">4</mcreference>
- 支持长时间运行任务和人机协作场景
- 支持多种内容类型和模态

### 4. 企业级特性
- 内置安全、认证和授权机制
- 支持可观测性和监控
- 支持水平扩展和高可用部署

## 总结

基于A2A协议的Agent团队协作系统将为Micro Butler提供真正的多Agent协作能力，实现从传统的工具调用模式向Agent协作模式的转变。通过Leader-Worker架构，系统能够：

1. **智能任务分解**: Leader Agent能够将复杂任务分解为专业化的子任务
2. **动态Agent发现**: 自动发现和选择最适合的Worker Agent
3. **协作式执行**: Worker Agent作为独立实体协作完成任务
4. **统一结果整合**: Leader Agent整合各Worker Agent的结果

这种架构不仅提高了系统的可扩展性和灵活性，还为未来集成更多专业化Agent奠定了坚实基础。