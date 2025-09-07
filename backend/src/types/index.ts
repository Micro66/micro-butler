// ============================================================================
// Core Task Types
// ============================================================================

export interface TaskMetadata {
  task?: string
  images?: string[]
  createdAt?: number
  updatedAt?: number
}

export interface TaskOptions {
  taskId?: string
  apiConfiguration?: ApiConfiguration // 改为可选，让Task内部处理默认值
  configManager?: any // 添加ConfigManager依赖注入
  task?: string
  images?: string[]
  workspacePath?: string
  enableDiff?: boolean
  enableCheckpoints?: boolean
  consecutiveMistakeLimit?: number
  fuzzyMatchThreshold?: number
  onCreated?: (task: Task) => void
  initialTodos?: TodoItem[]
}

export interface Task {
  taskId: string
  instanceId: string
  metadata: TaskMetadata
  workspacePath: string
  abort: boolean
  isInitialized: boolean
  isPaused: boolean
  
  // Core methods
  startTask(task?: string, images?: string[]): Promise<void>
  abortTask(): Promise<void>
  pauseTask(): Promise<void>
  resumeTask(): Promise<void>
  getStatus(): TaskStatus
}

export type TaskStatus = 'created' | 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'aborted'

export interface TaskStatusUpdate {
  taskId: string
  status: TaskStatus
  progress?: number
  message?: string
  toolCall?: ToolCall
  result?: any
  timestamp: number
}

// ============================================================================
// API Configuration Types
// ============================================================================

export interface ApiConfiguration {
  provider?: ApiProvider
  apiProvider?: ApiProvider
  apiModelId?: string
  apiKey?: string
  apiBaseUrl?: string
  maxTokens?: number
  temperature?: number
}

export type ApiProvider = 'anthropic' | 'openai' | 'google' | 'ollama' | 'siliconflow'

export interface ApiMessage {
  role: 'user' | 'assistant'
  content: any[]
  ts?: number
}

// ============================================================================
// Tool System Types
// ============================================================================

export interface ToolCall {
  id: string
  name: string
  parameters: Record<string, any>
  result?: any
  error?: string
  timestamp: number
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, any>
    required?: string[]
  }
  group: ToolGroup
  execute: (context: ToolExecutionContext) => Promise<ToolExecutionResult>
}

export type ToolGroup = 'read' | 'edit' | 'command' | 'browser' | 'mcp'

export interface ToolExecutionContext {
  workspacePath: string
  taskId: string
  security: SecurityConfig
  parameters: Record<string, any>
  securityManager: any
}

export interface ToolExecutionResult {
  success: boolean
  result?: any
  error?: string
  metadata?: Record<string, any>
  executionTime: number
}

// ============================================================================
// Security Types
// ============================================================================

export interface SecurityConfig {
  enableSecurity?: boolean
  commandWhitelist?: string[]
  commandBlacklist?: string[]
  allowedPaths?: string[]
  blockedPaths?: string[]
  allowedTools?: string[]
  blockedTools?: string[]
  enforceCommandWhitelist?: boolean
  blockSensitiveDirectories?: boolean
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ServerConfig {
  host?: string
  port?: number
  cors?: {
    enabled: boolean
    origins: string[]
    methods?: string[]
    allowedHeaders?: string[]
  }
}

export interface StorageConfig {
  type?: 'file' | 'redis' | 'mongodb'
  path?: string
  connectionString?: string
  maxTaskHistory?: number
  cleanupInterval?: number
}

export interface TaskStorageOptions {
  storageType: 'file' | 'redis' | 'mongodb';
  storagePath?: string;
  maxTaskHistory?: number;
  cleanupInterval?: number;
}

export interface LoggingConfig {
  level?: 'error' | 'warn' | 'info' | 'debug'
  format?: 'json' | 'simple' | 'colorized'
  console?: {
    enabled: boolean
    level: 'error' | 'warn' | 'info' | 'debug'
  }
  file?: {
    enabled: boolean
    level: 'error' | 'warn' | 'info' | 'debug'
    filename: string
    maxSize: string
    maxFiles: number
  }
}

export interface AppConfig {
  server: ServerConfig
  api: ApiConfig
  security: SecurityConfig
  storage: StorageConfig
  logging: LoggingConfig
  defaultApiConfiguration: ApiConfiguration
  apiConfigurations?: Partial<Record<ApiProvider, ApiConfiguration>>
}

export interface ApiConfig {
  rateLimit?: {
    windowMs: number
    max: number
  }
  timeout?: number
}

// ============================================================================
// Message Types
// ============================================================================

export interface ClineMessage {
  type: 'say' | 'ask'
  say?: 'text' | 'api_req_started' | 'api_req_finished' | 'tool' | 'completion_result'
  ask?: 'followup' | 'command' | 'completion_result' | 'tool'
  text?: string
  images?: string[]
  partial?: boolean
  ts: number
}

export interface ClineAskResponse {
  response: 'messageResponse' | 'yesButtonTapped' | 'noButtonTapped'
  text?: string
  images?: string[]
}

// ============================================================================
// Todo System Types
// ============================================================================

export interface TodoItem {
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'high' | 'medium' | 'low'
  createdAt: number
  updatedAt?: number
}

// ============================================================================
// HTTP API Types
// ============================================================================

export interface CreateTaskRequest {
  task: string
  images?: string[]
  workspacePath?: string
  configuration?: Partial<ApiConfiguration>
  apiConfiguration?: ApiConfiguration | undefined // 明确允许undefined
  prompt?: string
  workingDirectory?: string
  context?: Record<string, any>
}

export interface CreateTaskResponse {
  taskId: string
  status: TaskStatus
  message: string
  createdAt: Date
}

export interface StartTaskRequest {
  stream?: boolean
}

export interface StartTaskResponse {
  message: string
  stream?: boolean
}

export interface GetTaskResponse {
  taskId: string
  status: TaskStatus
  metadata: TaskMetadata
  messages: ClineMessage[]
  todos?: TodoItem[]
  createdAt: number
  updatedAt: number
  completedAt?: Date
}

export interface ListTasksResponse {
  tasks: Array<{
    taskId: string
    status: TaskStatus
    metadata: TaskMetadata
    createdAt: number
    updatedAt: number
  }>
  total: number
  page: number
  limit: number
  pagination: {
    page: number
    limit: number
    totalPages: number
  }
}

// ============================================================================
// WebSocket Types
// ============================================================================

export interface WebSocketMessage {
  type: 'task_status' | 'task_message' | 'tool_call' | 'error'
  data: any
  timestamp: number
}

// ============================================================================
// Error Types
// ============================================================================

export class TaskError extends Error {
  constructor(
    message: string,
    public code: string,
    public taskId?: string
  ) {
    super(message)
    this.name = 'TaskError'
  }
}

export class ToolError extends Error {
  constructor(
    message: string,
    public toolName: string,
    public parameters?: Record<string, any>
  ) {
    super(message)
    this.name = 'ToolError'
  }
}

export class SecurityError extends Error {
  constructor(
    message: string,
    public operation: string,
    public resource?: string
  ) {
    super(message)
    this.name = 'SecurityError'
  }
}

// ============================================================================
// Event Types
// ============================================================================

export interface TaskEvents {
  'task:created': (taskId: string) => void
  'task:started': (taskId: string) => void
  'task:paused': (taskId: string) => void
  'task:resumed': (taskId: string) => void
  'task:completed': (taskId: string, result: any) => void
  'task:failed': (taskId: string, error: Error) => void
  'task:aborted': (taskId: string) => void
  'task:message': (taskId: string, message: ClineMessage) => void
  'tool:call': (taskId: string, toolCall: ToolCall) => void
  'tool:result': (taskId: string, toolCall: ToolCall, result: ToolExecutionResult) => void
}

// ============================================================================
// Utility Types
// ============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>