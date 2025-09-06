import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import * as path from 'node:path'
import * as os from 'node:os'

import {
  Task as ITask,
  TaskOptions,
  TaskMetadata,
  TaskStatus,
  TaskStatusUpdate,
  ApiConfiguration,
  ApiMessage,
  ClineMessage,
  ClineAskResponse,
  TodoItem,
  ToolCall,
  TaskError
} from '@/types'

import { ApiHandler } from '@/core/api/ApiHandler'
import { ToolExecutor } from '@/core/tools/ToolExecutor'
import { ToolRegistry } from '@/core/tools/ToolRegistry'
import { PromptService } from '@/core/prompt/PromptService'
import { SecurityManager } from '@/core/security/SecurityManager'
import { ConfigManager } from '@/config/ConfigManager'
import { createLogger } from '@/utils/Logger'
import { getAllToolGroups } from '@/tools/index'

const DEFAULT_CONSECUTIVE_MISTAKE_LIMIT = 3

/**
 * Core Task class that manages AI-powered programming tasks
 * Extracted and refactored from the original roo-code VS Code extension
 */
export class Task extends EventEmitter implements ITask {
  // Core identifiers
  public readonly taskId: string
  public readonly instanceId: string
  public readonly workspacePath: string
  
  // Task state
  public metadata: TaskMetadata
  public abort: boolean = false
  public isInitialized: boolean = false
  public isPaused: boolean = false
  
  // Configuration
  private readonly apiConfiguration: ApiConfiguration
  private readonly configManager?: ConfigManager
  private readonly enableDiff: boolean
  private readonly enableCheckpoints: boolean
  private readonly consecutiveMistakeLimit: number
  private readonly fuzzyMatchThreshold: number
  
  // Core services
  private readonly apiHandler: ApiHandler
  private readonly toolExecutor: ToolExecutor
  private readonly toolRegistry: ToolRegistry
  private readonly promptService: PromptService
  private readonly securityManager: SecurityManager
  private readonly logger: any
  
  // Task data
  private apiConversationHistory: ApiMessage[] = []
  private clineMessages: ClineMessage[] = []
  private todoList: TodoItem[] = []
  private consecutiveMistakeCount: number = 0
  
  // Streaming state
  private isStreaming: boolean = false
  private currentStreamingContentIndex: number = 0
  private assistantMessageContent: any[] = []
  
  // Ask state
  private askResponse?: ClineAskResponse
  private askResponseText?: string
  private askResponseImages?: string[]
  
  constructor(options: TaskOptions) {
    super()
    
    // Validate required options
    if (!options.task && !options.images) {
      throw new TaskError('Either task or images must be provided', 'INVALID_OPTIONS')
    }
    
    // Initialize identifiers
    this.taskId = options.taskId || randomUUID()
    this.instanceId = randomUUID().slice(0, 8)
    this.workspacePath = options.workspacePath || path.join(os.homedir(), 'Desktop')
    
    // Initialize metadata
    this.metadata = {
      task: options.task || '',
      images: options.images || [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    
    // Store configuration
    this.configManager = options.configManager
    if (!options.apiConfiguration && !options.configManager) {
      throw new TaskError('Either apiConfiguration or configManager must be provided', 'MISSING_CONFIG')
    }
    this.apiConfiguration = options.apiConfiguration || options.configManager!.getDefaultApiConfiguration()
    this.enableDiff = options.enableDiff ?? false
    this.enableCheckpoints = options.enableCheckpoints ?? true
    this.consecutiveMistakeLimit = options.consecutiveMistakeLimit ?? DEFAULT_CONSECUTIVE_MISTAKE_LIMIT
    this.fuzzyMatchThreshold = options.fuzzyMatchThreshold ?? 1.0
    
    // Initialize services
    this.logger = createLogger('task', { taskId: this.taskId })
    this.apiHandler = new ApiHandler(this.apiConfiguration)
    this.securityManager = new SecurityManager({ allowedPaths: [this.workspacePath] })
    this.toolExecutor = new ToolExecutor(this.logger, this.securityManager)
    this.toolRegistry = new ToolRegistry(this.logger, this.securityManager)
    this.promptService = new PromptService(this.toolRegistry)
    
    // Register all available tool groups
    const toolGroups = getAllToolGroups()
    for (const toolGroup of toolGroups) {
      this.toolExecutor.registerToolGroup(toolGroup)
      // Register individual tools in ToolRegistry
      for (const tool of toolGroup.tools) {
        this.toolRegistry.registerTool(tool)
      }
      this.logger.debug(`Registered tool group: ${toolGroup.name} with ${toolGroup.tools.length} tools`)
    }
    
    // Initialize todo list if provided
    if (options.initialTodos && options.initialTodos.length > 0) {
      this.todoList = [...options.initialTodos]
    }
    
    // Call creation callback
    options.onCreated?.(this)
    
    this.logger.info('Task created', {
      taskId: this.taskId,
      instanceId: this.instanceId,
      workspacePath: this.workspacePath
    })
  }
  
  /**
   * Start the task execution
   */
  public async startTask(task?: string, images?: string[]): Promise<void> {
    try {
      this.logger.info('=== 任务开始 ===', {
        taskId: this.taskId,
        instanceId: this.instanceId,
        workspacePath: this.workspacePath,
        task: task || this.metadata.task,
        images: images?.length || 0,
        apiConfiguration: {
          provider: this.apiConfiguration.provider,
          model: this.apiConfiguration.apiModelId
        }
      })
      
      console.log(`\n🚀 [${this.taskId}] 任务启动`)
      console.log(`📝 用户输入: ${task || this.metadata.task}`)
      console.log(`🖼️  图片数量: ${images?.length || 0}`)
      console.log(`🤖 AI模型: ${this.apiConfiguration.provider}/${this.apiConfiguration.apiModelId}`)
      
      // Update metadata if new task/images provided
      if (task) this.metadata.task = task
      if (images) this.metadata.images = images
      this.metadata.updatedAt = Date.now()
      
      // Reset state
      this.clineMessages = []
      this.apiConversationHistory = []
      this.abort = false
      this.isPaused = false
      
      // Emit task started event
      this.emit('task:started', this.taskId)
      this.emitStatusUpdate('running', 'Task started')
      
      // Add initial message
      await this.addClineMessage({
        type: 'say',
        say: 'text',
        text: task || this.metadata.task || '',
        images: images || this.metadata.images || [],
        ts: Date.now()
      })
      
      this.isInitialized = true
      
      // Start the main task loop
      await this.initiateTaskLoop(task || this.metadata.task || '', images || this.metadata.images)
      
    } catch (error) {
      this.logger.error('❌ 任务执行失败', {
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error,
        taskId: this.taskId
      })
      
      console.log(`\n❌ [${this.taskId}] 任务失败: ${error instanceof Error ? error.message : String(error)}`)
      
      this.emit('task:failed', this.taskId, error)
      this.emitStatusUpdate('failed', `Failed to start task: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }
  
  /**
   * Abort the task execution
   */
  public async abortTask(): Promise<void> {
    this.logger.info('Aborting task', { taskId: this.taskId })
    
    this.abort = true
    this.isStreaming = false
    
    // Stop any ongoing API requests
    await (this.apiHandler as any).abortRequest?.()
    
    this.emit('task:aborted', this.taskId)
    this.emitStatusUpdate('aborted', 'Task aborted by user')
  }
  
  /**
   * Pause the task execution
   */
  public async pauseTask(): Promise<void> {
    this.logger.info('Pausing task', { taskId: this.taskId })
    
    this.isPaused = true
    
    this.emit('task:paused', this.taskId)
    this.emitStatusUpdate('paused', 'Task paused')
  }
  
  /**
   * Resume the task execution
   */
  public async resumeTask(): Promise<void> {
    this.logger.info('Resuming task', { taskId: this.taskId })
    
    this.isPaused = false
    
    this.emit('task:resumed', this.taskId)
    this.emitStatusUpdate('running', 'Task resumed')
  }
  
  /**
   * Get current task status
   */
  public getStatus(): TaskStatus {
    if (this.abort) return 'aborted'
    if (this.isPaused) return 'paused'
    if (!this.isInitialized) return 'pending'
    if (this.isStreaming) return 'running'
    
    // Check if task is completed based on last message
    const lastMessage = this.clineMessages[this.clineMessages.length - 1]
    console.log(`\n✅ [${this.taskId}] 任务完成: ${lastMessage?.say}`)
    if (lastMessage?.say === 'completion_result') {
      return 'completed'
    }
    
    return 'running'
  }
  
  /**
   * Get task messages
   */
  public getMessages(): ClineMessage[] {
    return [...this.clineMessages]
  }
  
  /**
   * Get todo list
   */
  public getTodos(): TodoItem[] {
    return [...this.todoList]
  }
  
  /**
   * Update todo list
   */
  public updateTodos(todos: TodoItem[]): void {
    this.todoList = [...todos]
    this.metadata.updatedAt = Date.now()
    this.emit('task:message', this.taskId, {
      type: 'say',
      say: 'text',
      text: 'Todo list updated',
      ts: Date.now()
    })
  }
  
  /**
   * Main task execution loop
   */
  private async initiateTaskLoop(task: string, images?: string[]): Promise<void> {
    try {
      let userContent = this.buildInitialUserContent(task, images)
      let includeFileDetails = true
      
      while (!this.abort && !this.isPaused && this.getStatus() !== 'completed') {
        const didEndLoop = await this.recursivelyMakeRequests(userContent, includeFileDetails)
        includeFileDetails = false // Only need file details the first time
        
        if (didEndLoop) {
          break
        } else {
          // No tools were used, ask AI to continue or complete
          userContent = [{
            type: 'text',
            text: 'Continue with the task or call attempt_completion if you believe the task is complete.'
          }]
          this.consecutiveMistakeCount++
        }
      }
      
      if (!this.abort && !this.isPaused) {
        this.emit('task:completed', this.taskId, { success: true })
        this.emitStatusUpdate('completed', 'Task completed successfully')
      }
      
    } catch (error) {
      this.logger.error('Task loop failed', { error, taskId: this.taskId })
      this.emit('task:failed', this.taskId, error)
      this.emitStatusUpdate('failed', `Task failed: ${error instanceof Error ? error.message : String(error)}`)
      throw error
    }
  }
  
  /**
   * Recursively make API requests and handle tool calls
   */
  private async recursivelyMakeRequests(
    userContent: any[],
    includeFileDetails: boolean = false
  ): Promise<boolean> {
    if (this.abort || this.isPaused) {
      return true
    }
    
    // Check consecutive mistake limit (following roo-code pattern)
    if (this.consecutiveMistakeLimit > 0 && this.consecutiveMistakeCount >= this.consecutiveMistakeLimit) {
      await this.handleConsecutiveMistakeLimit()
      this.consecutiveMistakeCount = 0
      // Continue with user guidance instead of ending task
    }
    
    // Generate system prompt
    const availableTools = this.toolExecutor.getAvailableTools()
    const systemPrompt = await this.promptService.generateSystemPrompt({
      cwd: this.workspacePath,
      mode: 'code',
      supportsComputerUse: false,
      availableTools,
      environmentInfo: {
        os: process.platform,
        shell: process.env.SHELL || 'bash',
        cwd: this.workspacePath
      }
    })
    
    // Add environment details if needed
    if (includeFileDetails) {
      const environmentDetails = await this.getEnvironmentDetails()
      userContent.push({
        type: 'text',
        text: environmentDetails
      })
    }
    
    // Add to conversation history
    await this.addToApiConversationHistory({
      role: 'user',
      content: userContent
    })
    
    // Make API request
    const response = await this.makeApiRequest(systemPrompt, this.apiConversationHistory)
    
    // Process response and handle tool calls
    return await this.processApiResponse(response)
  }
  
  /**
   * Make API request to AI provider
   */
  private async makeApiRequest(systemPrompt: string, messages: ApiMessage[]): Promise<any> {
    this.isStreaming = true
    
    console.log(`\n🔄 [${this.taskId}] 发送API请求`)
    console.log(`📊 消息历史数量: ${messages.length}`)
    console.log(`🎯 系统提示词长度: ${systemPrompt.length} 字符`)
    
    this.logger.info('🔄 发送API请求', {
      taskId: this.taskId,
      messageCount: messages.length,
      systemPromptLength: systemPrompt.length,
      provider: this.apiConfiguration.provider,
      model: this.apiConfiguration.apiModelId
    })
    
    try {
      const response = await this.apiHandler.makeRequest(
        messages,
        (chunk) => {
          // Handle streaming chunks
          this.emit('streamChunk', chunk)
        },
        systemPrompt
      )
      
      console.log(`✅ [${this.taskId}] API请求成功完成`)
      this.logger.info('✅ API请求成功', {
        taskId: this.taskId,
        responseReceived: true
      })
      
      return response
      
    } catch (error) {
      this.isStreaming = false
      console.log(`❌ [${this.taskId}] API请求失败: ${error instanceof Error ? error.message : String(error)}`)
      
      this.logger.error('❌ API请求失败', { 
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error, 
        taskId: this.taskId 
      })
      throw error
    }
  }
  
  /**
   * Process API response and handle tool calls
   */
  private async processApiResponse(response: any): Promise<boolean> {
    let assistantMessage = ''
    let toolCalls: ToolCall[] = []
    
    console.log(`\n🧠 [${this.taskId}] 处理AI响应`)
    
    try {
      // Check if response is a streaming response (async iterable)
      if (response && typeof response[Symbol.asyncIterator] === 'function') {
        console.log(`📡 [${this.taskId}] 处理流式响应`)
        // Process streaming response
        for await (const chunk of response) {
          if (this.abort) break
          
          if (chunk.type === 'text') {
            assistantMessage += chunk.text
            await this.updateStreamingMessage(assistantMessage)
          } else if (chunk.type === 'tool_use') {
            console.log(`🔧 [${this.taskId}] 检测到工具调用: ${chunk.name}`)
            toolCalls.push({
              id: chunk.id,
              name: chunk.name,
              parameters: chunk.input,
              timestamp: Date.now()
            })
          }
        }
      } else {
        console.log(`📄 [${this.taskId}] 处理非流式响应`)
        // Process non-streaming response (ApiResponse object)
        assistantMessage = response.content || ''
        // Parse XML-style tool calls from assistant message
        toolCalls = this.parseXmlToolCalls(assistantMessage)
      }
      
      this.isStreaming = false
      
      console.log(`\n💬 [${this.taskId}] AI回复内容:`)
      console.log(`${assistantMessage.substring(0, 200)}${assistantMessage.length > 200 ? '...' : ''}`)
      console.log(`📏 回复长度: ${assistantMessage.length} 字符`)
      
      this.logger.info('🧠 AI响应处理完成', {
        taskId: this.taskId,
        messageLength: assistantMessage.length,
        toolCallsCount: toolCalls.length,
        toolNames: toolCalls.map(tc => tc.name)
      })
      
      // Add assistant message to conversation
      await this.addToApiConversationHistory({
        role: 'assistant',
        content: [{ type: 'text', text: assistantMessage }]
      })
      
      // Execute tool calls if any
      if (toolCalls.length > 0) {
        console.log(`\n🔧 [${this.taskId}] 执行 ${toolCalls.length} 个工具调用`)
        await this.executeToolCalls(toolCalls)
        return false // Continue the loop
      }
      
      // No tool calls detected - this shouldn't happen in normal operation
      // The AI should use tools to complete tasks, so we need to prompt it to try again
      console.log(`\n⚠️ [${this.taskId}] 未检测到工具调用，提示AI重试`)
      
      // Increment consecutive mistake count
      this.consecutiveMistakeCount++
      
      // Check if we've hit the consecutive mistake limit
      if (this.consecutiveMistakeCount >= this.consecutiveMistakeLimit && this.consecutiveMistakeLimit > 0) {
        console.log(`\n⚠️ [${this.taskId}] 达到连续错误限制 (${this.consecutiveMistakeLimit})，请求用户指导`)
        await this.handleConsecutiveMistakeLimit()
        this.consecutiveMistakeCount = 0 // Reset counter after handling
        return false // Continue the loop with user guidance
      }
      
      // Add a message to prompt the AI to use tools (following roo-code format)
      const errorMessage = {
        role: 'user' as const,
        content: [
          {
            type: 'text' as const,
            text: `[ERROR] You did not use a tool in your previous response! Please retry with a tool use.

# Reminder: Instructions for Tool Use

Tool uses are formatted using XML-style tags. The tool name itself becomes the XML tag name. Each parameter is enclosed within its own set of tags. Here's the structure:

<actual_tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
...
</actual_tool_name>

For example, to use the attempt_completion tool:

<attempt_completion>
<result>
I have completed the task...
</result>
</attempt_completion>

Always use the actual tool name as the XML tag name for proper parsing and execution.

# Next Steps

If you have completed the user's task, use the attempt_completion tool.
If you require additional information from the user, use the ask_followup_question tool.
Otherwise, if you have not completed the task and do not need additional information, then proceed with the next step of the task.
(This is an automated message, so do not respond to it conversationally.)`
          }
        ]
      }
      
      // Add the error message to conversation history
      await this.addToApiConversationHistory(errorMessage)
      
      return false // Continue the loop to give AI another chance
      
    } catch (error) {
      this.isStreaming = false
      console.log(`❌ [${this.taskId}] 处理AI响应失败: ${error instanceof Error ? error.message : String(error)}`)
      
      this.logger.error('❌ 处理AI响应失败', { 
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : error, 
        taskId: this.taskId 
      })
      throw error
    }
  }
  
  /**
   * Parse XML-style tool calls from assistant message
   */
  private parseXmlToolCalls(message: string): ToolCall[] {
     const toolCalls: ToolCall[] = []
     
     // Regular expression to match XML-style tool calls
     // Matches: <tool_name>...parameters...</tool_name>
     const toolRegex = /<(\w+)>([\s\S]*?)<\/\1>/g
     let match
     
     while ((match = toolRegex.exec(message)) !== null) {
       const toolName = match[1]
       const toolContent = match[2]
       
       if (!toolName || toolContent === undefined) {
         continue
       }
       
       console.log(`🔧 [${this.taskId}] 检测到XML工具调用: ${toolName}`)
       
       // Parse parameters from tool content
       const parameters: Record<string, any> = {}
       
       // Extract parameters using regex for <param_name>value</param_name>
       const paramRegex = /<(\w+)>([\s\S]*?)<\/\1>/g
       let paramMatch
       
       while ((paramMatch = paramRegex.exec(toolContent)) !== null) {
         const paramName = paramMatch[1]
         const paramValue = paramMatch[2]
         if (paramName && paramValue !== undefined) {
           parameters[paramName] = paramValue.trim()
         }
       }
       
       // If no parameters found, treat the entire content as a single parameter
       if (Object.keys(parameters).length === 0 && toolContent && toolContent.trim()) {
         // For tools like execute_command, the content might be the command itself
         if (toolName === 'execute_command') {
           parameters.command = toolContent.trim()
         } else {
           parameters.content = toolContent.trim()
         }
       }
       
       toolCalls.push({
         id: `xml_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
         name: toolName,
         parameters,
         timestamp: Date.now()
       })
     }
     
     return toolCalls
   }
  
  /**
   * Execute tool calls
   */
  private async executeToolCalls(toolCalls: ToolCall[]): Promise<void> {
    const toolResults: any[] = []
    
    for (let i = 0; i < toolCalls.length; i++) {
      const toolCall = toolCalls[i]
      if (!toolCall) continue
      
      console.log(`\n🔧 [${this.taskId}] 执行工具 ${i + 1}/${toolCalls.length}: ${toolCall.name}`)
      console.log(`📋 工具参数:`, JSON.stringify(toolCall.parameters, null, 2))
      
      try {
        this.emit('tool:call', this.taskId, toolCall)
        
        const startTime = Date.now()
        const result = await this.toolExecutor.executeTool(
          toolCall,
          {
            workspacePath: this.workspacePath,
            taskId: this.taskId,
            security: {
              enableSecurity: true,
              enforceCommandWhitelist: false,
              blockSensitiveDirectories: true
            },
            parameters: toolCall.parameters,
            securityManager: this.securityManager
          }
        )
        
        const executionTime = Date.now() - startTime
        
        toolCall.result = result.result
        if (!result.success) {
          toolCall.error = result.error || 'Unknown error'
        }
        
        if (result.success) {
          console.log(`✅ [${this.taskId}] 工具执行成功 (${executionTime}ms)`)
          console.log(`📤 工具结果:`, typeof result.result === 'string' ? 
            result.result.substring(0, 300) + (result.result.length > 300 ? '...' : '') : 
            JSON.stringify(result.result).substring(0, 300))
        } else {
          console.log(`❌ [${this.taskId}] 工具执行失败 (${executionTime}ms): ${result.error}`)
        }
        
        this.logger.info('🔧 工具执行完成', {
          taskId: this.taskId,
          toolName: toolCall.name,
          success: result.success,
          executionTime,
          resultLength: typeof result.result === 'string' ? result.result.length : JSON.stringify(result.result).length
        })
        
        this.emit('tool:result', this.taskId, toolCall, result)
        
        // Check if this is attempt_completion tool with completion_result
        if (toolCall.name === 'attempt_completion' && result.success && result.result.result === 'completion_result') {
          // Add completion_result message to clineMessages to mark task as completed
          await this.addClineMessage({
            type: 'ask',
            say: 'completion_result',
            text: 'Task completed successfully',
            ts: Date.now()
          })
        }
        
        // Add tool result to conversation
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: result.success ? result.result : `Error: ${result.error}`
        })
        
      } catch (error) {
        console.log(`❌ [${this.taskId}] 工具执行异常: ${error instanceof Error ? error.message : String(error)}`)
        
        this.logger.error('❌ 工具执行异常', {
          error,
          toolName: toolCall.name,
          taskId: this.taskId
        })
        
        toolCall.error = error instanceof Error ? error.message : String(error)
        
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: `Error: ${toolCall.error}`
        })
      }
    }
    
    console.log(`\n📝 [${this.taskId}] 所有工具执行完成，添加结果到对话历史`)
    
    // Reset consecutive mistake count since tools were successfully executed
    this.consecutiveMistakeCount = 0
    
    // Add tool results to conversation history
    await this.addToApiConversationHistory({
      role: 'user',
      content: toolResults
    })
  }
  
  /**
   * Helper methods
   */
  
  private buildInitialUserContent(task: string, images?: string[]): any[] {
    const content: any[] = [{
      type: 'text',
      text: `<task>\n${task}\n</task>`
    }]
    
    if (images && images.length > 0) {
      for (const image of images) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: image
          }
        })
      }
    }
    
    return content
  }
  
  private async getEnvironmentDetails(): Promise<string> {
    // This would include file structure, system info, etc.
    // Simplified for now
    return `Environment Details:\nWorkspace: ${this.workspacePath}\nTimestamp: ${new Date().toISOString()}`
  }
  
  private async handleConsecutiveMistakeLimit(): Promise<void> {
    // Following roo-code pattern: ask user for guidance when mistake limit is reached
    const message = `You seem to be having trouble proceeding. Please provide feedback to help guide the AI:`
    
    await this.addClineMessage({
      type: 'ask',
      ask: 'followup',
      text: message,
      ts: Date.now()
    })
    
    // Wait for user response (this would be handled by the frontend)
    // For now, we'll add a default guidance message
    const guidanceMessage = `You seem to be having trouble proceeding. The user has provided the following feedback to help guide you:\n<feedback>\nPlease be more careful and think step by step. Make sure to use the appropriate tools to complete the task.\n</feedback>`
    
    await this.addToApiConversationHistory({
      role: 'user',
      content: [{
        type: 'text',
        text: guidanceMessage
      }]
    })
  }
  
  private async updateStreamingMessage(content: string): Promise<void> {
    const message: ClineMessage = {
      type: 'say',
      say: 'text',
      text: content,
      partial: true,
      ts: Date.now()
    }
    
    // Update or add streaming message
    if (this.clineMessages.length > 0 && this.clineMessages[this.clineMessages.length - 1]?.partial) {
      this.clineMessages[this.clineMessages.length - 1] = message
    } else {
      this.clineMessages.push(message)
    }
    
    this.emit('task:message', this.taskId, message)
  }
  
  private async addClineMessage(message: ClineMessage): Promise<void> {
    this.clineMessages.push(message)
    this.metadata.updatedAt = Date.now()
    this.emit('task:message', this.taskId, message)
  }
  
  private async addToApiConversationHistory(message: ApiMessage): Promise<void> {
    const messageWithTs = { ...message, ts: Date.now() }
    this.apiConversationHistory.push(messageWithTs)
  }
  
  private emitStatusUpdate(status: TaskStatus, message?: string): void {
    const update: TaskStatusUpdate = {
      taskId: this.taskId,
      status,
      message: message || 'Task update',
      timestamp: Date.now()
    }
    
    this.emit('task:status', update)
  }
}