import { ToolDefinition } from '../../types/index.js';
import { Logger } from 'winston';
import { PromptService, Mode, PromptContext } from '../prompt/PromptService.js';

export interface PromptGeneratorOptions {
  cwd: string;
  mode: Mode;
  supportsComputerUse: boolean;
  language?: string;
  customInstructions?: string;
  diffEnabled?: boolean;
  browserViewportSize?: string;
  modelId?: string;
  experiments?: Record<string, boolean>;
  availableTools?: ToolDefinition[];
  environmentInfo?: any;
}

/**
 * PromptGenerator - 负责生成系统提示的核心类
 * 参考roo-code的generatePrompt函数架构，作为PromptService的高级封装
 * 提供更简洁的API接口
 */
export class PromptGenerator {
  private logger: Logger;
  private promptService: PromptService;

  constructor(promptService: PromptService, logger?: Logger) {
    this.promptService = promptService;
    this.logger = logger || console as any;
  }

  /**
   * 生成系统提示 - 主要入口点
   */
  async generateSystemPrompt(options: PromptGeneratorOptions): Promise<string> {
    const promptContext = this.buildPromptContext(options);
    return await this.promptService.generateSystemPrompt(promptContext);
  }

  /**
   * 构建提示上下文 - 将选项转换为PromptContext
   */
  private buildPromptContext(options: PromptGeneratorOptions): PromptContext {
    const {
      cwd,
      mode,
      supportsComputerUse,
      language = 'en',
      customInstructions,
      diffEnabled = true,
      browserViewportSize,
      modelId,
      experiments = {}
    } = options;

    const context: PromptContext = {
      cwd,
      mode,
      supportsComputerUse
    };

    // 只添加已定义的可选属性
    if (language !== undefined) context.language = language;
    if (customInstructions !== undefined) context.customInstructions = customInstructions;
    if (diffEnabled !== undefined) context.diffEnabled = diffEnabled;
    if (browserViewportSize !== undefined) context.browserViewportSize = browserViewportSize;
    if (modelId !== undefined) context.modelId = modelId;
    if (experiments !== undefined) context.experiments = experiments;
    if (options.availableTools !== undefined) context.availableTools = options.availableTools;
    if (options.environmentInfo !== undefined) context.environmentInfo = options.environmentInfo;

    return context;
  }

  /**
   * 生成用户消息提示 - 便捷方法
   */
  generateUserPrompt(task: string, images?: string[]): string {
    return this.promptService.generateUserPrompt(task, images);
  }

  /**
   * 获取工具定义的 JSON Schema - 便捷方法
   */
  getToolsSchema(): any[] {
    return this.promptService.getToolsSchema();
  }

  /**
   * 已废弃：组装最终的提示 - 现在由PromptService处理
   */
  private assemblePrompt(context: any): string {
    const sections = [
      context.roleDefinition,
      this.getMarkdownFormattingSection(),
      this.getSharedToolUseSection(),
      context.toolDescriptions,
      this.getToolUseGuidelinesSection(),
      context.capabilities,
      context.rules,
      context.systemInfo,
      context.customInstructions || ''
    ].filter(Boolean);

    return sections.join('\n\n');
  }

  /**
   * 已废弃：获取角色定义 - 现在由PromptService处理
   */
  private getRoleDefinition(mode: Mode): string {
    // 这个方法已经移到PromptService中
    return '';
  }





  /**
   * 获取Markdown格式化说明
   */
  private getMarkdownFormattingSection(): string {
    return `# Markdown Formatting

When providing code examples or technical explanations, use proper markdown formatting:
- Use \`\`\`language\` code blocks for multi-line code
- Use \`inline code\` for short code snippets, file names, and technical terms
- Use **bold** for emphasis on important concepts
- Use proper headings (##, ###) to structure your responses
- Use bullet points and numbered lists for clarity`;
  }

  /**
   * 获取共享工具使用说明
   */
  private getSharedToolUseSection(): string {
    return `# Tool Usage Guidelines

## General Principles
- Always use the most appropriate tool for each task
- Provide clear, descriptive parameters when calling tools
- Handle errors gracefully and provide helpful feedback
- Consider the user's working directory and file structure
- Respect file permissions and system constraints

## Best Practices
- Read files before modifying them to understand the current state
- Use search tools to locate relevant code before making changes
- Test your changes when possible
- Provide clear explanations of what each tool call accomplishes`;
  }

  /**
   * 获取工具使用指导原则
   */
  private getToolUseGuidelinesSection(): string {
    return `# Tool Use Guidelines

## File Operations
- Always check if a file exists before reading or modifying it
- Use appropriate file paths (absolute vs relative)
- Handle file encoding properly
- Back up important files before major changes

## Code Modifications
- Understand the existing code structure before making changes
- Follow the project's coding style and conventions
- Add appropriate comments and documentation
- Consider the impact of changes on other parts of the codebase

## Error Handling
- Provide clear error messages when operations fail
- Suggest alternative approaches when the primary method doesn't work
- Validate inputs before processing
- Handle edge cases appropriately`;
  }

  /**
   * 获取能力说明
   */
  private getCapabilitiesSection(supportsComputerUse: boolean, diffEnabled: boolean): string {
    let capabilities = `# Capabilities

## Core Abilities
- Read and analyze code files
- Write and modify files
- Search through codebases
- Execute commands and scripts
- Provide code explanations and suggestions`;

    if (supportsComputerUse) {
      capabilities += '\n- Interact with browser and desktop applications';
    }

    if (diffEnabled) {
      capabilities += '\n- Generate and apply code diffs';
    }

    capabilities += `\n\n## Limitations
- Cannot access external networks without explicit tools
- Cannot modify system-level configurations without permission
- Cannot execute potentially harmful commands
- Cannot access files outside the specified working directory without explicit permission`;

    return capabilities;
  }

  /**
   * 获取规则说明
   */
  private getRulesSection(cwd: string, supportsComputerUse: boolean): string {
    return `# Rules and Constraints

## Working Directory
- Current working directory: ${cwd}
- Always use appropriate file paths relative to this directory
- Respect file system permissions and access controls

## Code Quality
- Write clean, readable, and maintainable code
- Follow established coding conventions and best practices
- Add appropriate comments and documentation
- Consider performance and security implications

## Safety
- Never execute potentially harmful commands
- Always validate user inputs
- Respect system resources and limitations
- Ask for confirmation before making significant changes${supportsComputerUse ? '\n- Be cautious when interacting with external applications' : ''}`;
  }

  /**
   * 获取系统信息
   */
  private getSystemInfoSection(cwd: string): string {
    return `# System Information

## Environment
- Working Directory: ${cwd}
- Platform: ${process.platform}
- Node.js Version: ${process.version}
- Architecture: ${process.arch}

## Available Tools
You have access to various tools for file operations, code analysis, and system interaction. Use them appropriately based on the task requirements.`;
  }
}