import { ToolDefinition } from '@/types';
import { Logger } from 'winston';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import * as os from 'os';

export type Mode = 'code' | 'ask' | 'architect' | 'debug' | 'orchestrator';

export interface PromptContext {
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
  environmentInfo?: {
    os: string;
    shell: string;
    cwd: string;
  };
}

export interface SystemPromptContext {
  roleDefinition: string;
  toolDescriptions: string;
  capabilities: string;
  rules: string;
  systemInfo: string;
  customInstructions?: string;
}

/**
 * PromptService - 参考roo-code的SYSTEM_PROMPT架构
 * 负责生成完整的系统提示，整合各个组件
 */
export class PromptService {
  private logger: Logger;
  private toolRegistry: ToolRegistry;

  constructor(toolRegistry: ToolRegistry, logger?: Logger) {
    this.toolRegistry = toolRegistry;
    this.logger = logger || console as any;
  }

  /**
   * 生成完整的系统提示 - 主入口函数
   */
  async generateSystemPrompt(context: PromptContext): Promise<string> {
    const promptContext = await this.buildPromptContext(context);
    return this.assemblePrompt(promptContext);
  }

  /**
   * 构建提示上下文
   */
  private async buildPromptContext(options: PromptContext): Promise<SystemPromptContext> {
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

    return {
      roleDefinition: this.getRoleDefinition(mode),
      toolDescriptions: await this.generateToolDescriptions({
        mode,
        cwd,
        supportsComputerUse,
        ...(browserViewportSize && { browserViewportSize }),
        ...(modelId && { modelId }),
        experiments
      }),
      capabilities: this.getCapabilitiesSection(),
      rules: this.getRulesSection(),
      systemInfo: this.getSystemInfoSection(),
      ...(customInstructions && { customInstructions })
    };
  }

  /**
   * 组装最终的提示
   */
  private assemblePrompt(context: SystemPromptContext): string {
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
   * 获取角色定义 - 参考roo-code的DEFAULT_MODES
   */
  private getRoleDefinition(mode: Mode): string {
    const roleDefinitions: Record<Mode, string> = {
      code: `You are Roo, a highly skilled software engineer with extensive knowledge in many programming languages, frameworks, design patterns, and best practices.`,
      
      ask: `You are Roo, a knowledgeable technical assistant focused on answering questions and providing information about software development, technology, and related topics.`,
      
      architect: `You are Roo, an experienced technical leader who is inquisitive and an excellent planner. Your goal is to gather information and get context to create a detailed plan for accomplishing the user's task.`,
      
      debug: `You are Roo, an expert software debugger specializing in systematic problem diagnosis and resolution.`,
      
      orchestrator: `You are Roo, a strategic workflow orchestrator who coordinates complex tasks by delegating them to appropriate specialized modes.`
    };

    return roleDefinitions[mode] || roleDefinitions.code;
  }

  /**
   * 生成工具描述 - 参考roo-code的getToolDescriptionsForMode
   */
  private async generateToolDescriptions(options: {
    mode: Mode;
    cwd: string;
    supportsComputerUse: boolean;
    browserViewportSize?: string;
    modelId?: string;
    experiments?: Record<string, boolean>;
  }): Promise<string> {
    const { mode, cwd, supportsComputerUse, browserViewportSize, modelId, experiments = {} } = options;
    
    // 获取模式允许的工具
    const availableTools = this.toolRegistry.getAllTools().filter(tool => {
      // 简单的模式过滤逻辑，可以根据需要扩展
      return true;
    });
    
    // 生成工具描述
    const toolDescriptions: string[] = [];
    
    for (const tool of availableTools) {
      const description = this.generateToolDescription(tool, {
        cwd,
        supportsComputerUse,
        ...(browserViewportSize && { browserViewportSize }),
        ...(modelId && { modelId }),
        experiments
      });
      if (description) {
        toolDescriptions.push(description);
      }
    }
    
    return toolDescriptions.length > 0 ? `# Tools\n\n${toolDescriptions.join('\n\n')}` : '';
  }

  /**
   * 生成单个工具的描述 - 参考roo-code格式
   */
  private generateToolDescription(
    tool: ToolDefinition,
    context: {
      cwd: string;
      supportsComputerUse: boolean;
      browserViewportSize?: string;
      modelId?: string;
      experiments?: Record<string, boolean>;
    }
  ): string | null {
    // 根据工具名称生成详细描述
    return this.generateDetailedToolDescription(tool, context);
  }

  /**
   * 生成详细的工具描述，包含Description、Parameters、Usage和Examples
   */
  private generateDetailedToolDescription(
    tool: ToolDefinition,
    context: {
      cwd: string;
      supportsComputerUse: boolean;
      browserViewportSize?: string;
      modelId?: string;
      experiments?: Record<string, boolean>;
    }
  ): string {
    let description = `## ${tool.name}\n`;
    
    // 添加详细的Description段落
    description += `Description: ${this.getEnhancedDescription(tool, context)}\n`;
    
    // 添加参数描述
    if (tool.parameters && typeof tool.parameters === 'object' && !Array.isArray(tool.parameters)) {
      const params = tool.parameters as Record<string, any>;
      if (params.properties && Object.keys(params.properties).length > 0) {
        description += 'Parameters:\n';
        
        for (const [paramName, paramDef] of Object.entries(params.properties)) {
          if (typeof paramDef === 'object' && paramDef !== null) {
            const required = params.required?.includes(paramName) ? '(required)' : '(optional)';
            const paramDescription = this.getEnhancedParameterDescription(paramName, paramDef as any, context);
            description += `- ${paramName}: ${required} ${paramDescription}\n`;
          }
        }
      }
    }
    
    // 添加Usage示例
    const usageExample = this.generateUsageExample(tool, context);
    if (usageExample) {
      description += `Usage:\n${usageExample}\n`;
    }
    
    // 添加具体示例
    const examples = this.generateToolExamples(tool, context);
    if (examples) {
      description += `\nExamples:\n${examples}`;
    }
    
    return description;
  }

  /**
   * 获取增强的工具描述
   */
  private getEnhancedDescription(tool: ToolDefinition, context: any): string {
    // 根据工具名称提供详细描述
    const enhancedDescriptions: Record<string, string> = {
      'read_file': `Request to read the contents of a file. The tool outputs line-numbered content for easy reference when creating diffs or discussing code. Supports text extraction from various file formats.`,
      'write_file': `Request to write content to a file. This tool is primarily used for creating new files or for scenarios where a complete rewrite of an existing file is intentionally required. If the file exists, it will be overwritten.`,
      'search_files': `Request to perform a regex search across files in a specified directory, providing context-rich results. This tool searches for patterns or specific content across multiple files.`,
      'execute_command': `Request to execute a command in the terminal. This tool allows you to run shell commands, scripts, and other executable programs in the workspace environment.`,
      'list_files': `Request to list files and directories in a specified path. This tool helps explore the project structure and locate specific files or directories.`
    };
    
    return enhancedDescriptions[tool.name] || tool.description || 'No description available';
  }

  /**
   * 获取增强的参数描述
   */
  private getEnhancedParameterDescription(paramName: string, paramDef: any, context: any): string {
    const baseDescription = paramDef.description || 'No description';
    
    // 为常见参数添加增强描述
    const enhancements: Record<string, string> = {
      'path': `File or directory path (relative to workspace directory ${context.cwd})`,
      'content': `The content to write to the file. When performing a full rewrite, ALWAYS provide the COMPLETE intended content of the file.`,
      'command': `The shell command to execute. Use appropriate shell syntax for the current operating system.`,
      'regex': `The regular expression pattern to search for. Uses standard regex syntax.`,
      'recursive': `Whether to search recursively through subdirectories. Defaults to false.`,
      'line_range': `Line range in format "start-end" (1-based, inclusive). Optional for reading specific portions of large files.`
    };
    
    const enhancement = enhancements[paramName];
    return enhancement || baseDescription;
  }

  /**
   * 生成工具使用示例
   */
  private generateUsageExample(tool: ToolDefinition, context: any): string {
    const usageExamples: Record<string, string> = {
      'read_file': `<read_file>
<path>path/to/file</path>
</read_file>`,
      'write_file': `<write_file>
<path>path/to/file</path>
<content>
Your file content here
</content>
</write_file>`,
      'search_files': `<search_files>
<path>directory/path</path>
<regex>search pattern</regex>
</search_files>`,
      'execute_command': `<execute_command>
<command>your command here</command>
</execute_command>`,
      'list_files': `<list_files>
<path>directory/path</path>
</list_files>`
    };
    
    return usageExamples[tool.name] || '';
  }

  /**
   * 生成工具具体示例
   */
  private generateToolExamples(tool: ToolDefinition, context: any): string {
    const examples: Record<string, string> = {
      'read_file': `1. Reading a single file:
<read_file>
<path>src/app.ts</path>
</read_file>`,
      'write_file': `1. Creating a new configuration file:
<write_file>
<path>config.json</path>
<content>
{
  "apiEndpoint": "https://api.example.com",
  "version": "1.0.0"
}
</content>
</write_file>`,
      'search_files': `1. Searching for TypeScript files:
<search_files>
<path>src</path>
<regex>function.*export</regex>
</search_files>`,
      'execute_command': `1. Running npm install:
<execute_command>
<command>npm install</command>
</execute_command>`,
      'list_files': `1. Listing files in src directory:
<list_files>
<path>src</path>
</list_files>`
    };
    
    return examples[tool.name] || '';
  }

  /**
   * 获取能力说明
   */
  private getCapabilitiesSection(): string {
    return `<capabilities>
You have access to tools that allow you to execute commands, read and write files, and interact with the development environment.
</capabilities>`;
  }

  /**
   * 获取规则说明
   */
  private getRulesSection(): string {
    return `<rules>
- Always follow security best practices
- Provide clear explanations for your actions
- Ask for clarification when requirements are unclear
</rules>`;
  }

  /**
   * 获取系统信息说明
   */
  private getSystemInfoSection(): string {
    return `<system_info>
You are operating in a development environment with access to various tools and capabilities.
</system_info>`;
  }

  /**
   * 获取工具使用说明
   */
  private getSharedToolUseSection(): string {
    return `<tool_use>
When using tools, follow these guidelines:
1. Use tools step by step
2. Verify results before proceeding
3. Handle errors gracefully
</tool_use>`;
  }

  /**
   * 获取工具使用指南
   */
  private getToolUseGuidelinesSection(): string {
    return `<guidelines>
- Use appropriate tools for each task
- Minimize unnecessary tool calls
- Provide clear explanations of your actions
</guidelines>`;
  }

  /**
   * 获取Markdown格式化说明
   */
  private getMarkdownFormattingSection(): string {
    return `You are a powerful agentic AI coding assistant, powered by Claude 4 Sonnet. You operate exclusively in Trae AI, the world's best IDE.

You are pair programming with a USER to solve their coding task. The task may require creating a new codebase, modifying or debugging an existing codebase, or simply answering a question.
Each time the USER sends a message, we may automatically attach some information about their current state, such as what files they have open, where their cursor is, recently viewed files, edit history in their session so far, and more. This information may or may not be relevant to the coding task, it is up for you to decide.

Your main goal is to follow the USER's instructions at each message, denoted by the <user_input> tag. You should analyze the user's input carefully, think step by step, format your thought, and call a suitable tool with proper input parameters to complete USER's input.`;
  }

  /**
   * 生成能力描述部分
   */
  private generateCapabilitiesSection(tools: ToolDefinition[]): string {
    if (tools.length === 0) {
      return '';
    }

    const toolDescriptions = tools.map(tool => {
      return `- **${tool.name}**: ${tool.description}`;
    }).join('\n');

    return `<capabilities>
You have access to the following tools and capabilities:

${toolDescriptions}

Use these tools strategically to complete the user's requests efficiently and effectively.
</capabilities>`;
  }

  /**
   * 生成环境信息部分
   */
  private generateEnvironmentSection(envInfo?: PromptContext['environmentInfo']): string {
    if (!envInfo) {
      return `<system_information>
Here's some information of USER's working environment currently
<operating_system_type>${os.type()}</operating_system_type>
<current_working_directory>${process.cwd()}</current_working_directory>
<shell_type>${process.env.SHELL || 'unknown'}</shell_type>
</system_information>`;
    }

    return `<system_information>
Here's some information of USER's working environment currently
<operating_system_type>${envInfo.os || os.type()}</operating_system_type>
<current_working_directory>${envInfo.cwd || process.cwd()}</current_working_directory>
<shell_type>${envInfo.shell || process.env.SHELL || 'unknown'}</shell_type>
</system_information>`;
  }

  /**
   * 生成工作区信息部分
   */
  private generateWorkspaceSection(workspacePath: string): string {
    return `<workspace_information>
<workspace_path>${workspacePath}</workspace_path>
</workspace_information>`;
  }

  /**
   * 生成指导原则部分
   */
  private generateGuidelinesSection(): string {
    return `<guidelines>
<communication>
Always refer to the USER in the second person and yourself in the first person in all USER-facing messages including tool call thoughts and session summaries.
</communication>

<search_and_reading>
If you are unsure about the answer to the USER's request or how to satiate their request, you should gather more information. This can be done with additional tool calls, asking clarifying questions, etc...
For example, if you've performed a semantic search, and the results may not fully answer the USER's request, or merit gathering more information, feel free to call more tools. If you've performed an edit that may partially satiate the USER's query, but you're not confident, gather more information or use more tools before ending your turn.
Bias towards not asking the user for help if you can find the answer yourself.
</search_and_reading>

<making_code_changes>
When making code changes, NEVER output code to the USER in your thought of tool call, unless requested. Instead, use one of the code edit tools to implement the change. Also, you MUST make sure you've gathered sufficient content before modifying any file.

When you are suggesting using a code edit tool, remember, it is *EXTREMELY* important that your generated code can be run immediately by the user. To ensure this, here's some suggestions:

1. When making changes to files, first understand the file's code conventions. Mimic code style, use existing libraries and utilities, and follow existing patterns.
2. Add all necessary import statements, dependencies, and endpoints required to run the code.
3. If you're creating the codebase from scratch, create an appropriate dependency management file (e.g. requirements.txt) with package versions and a helpful README.
4. If you're building a web app from scratch, give it a beautiful and modern UI, imbued with the best UX practices.
5. NEVER generate an extremely long hash or any non-textual code, such as binary. These are not helpful to the user and are very expensive.
6. ALWAYS make sure to complete all necessary modifications with the fewest possible steps (preferably using one step), UNLESS the changes are very big, then you are allowed to use maximum of 3 steps to implement them.
7. Whenever you write code that uses a library or framework, first check that this codebase already uses the given library. To achieve this, you can look at neighboring files, or check dependency management files like package.json, go.mod, etc.
8. Always follow security best practices. Never introduce code that exposes or logs secrets and keys. Never commit secrets or keys to the repository.
9. When creating image files, you MUST use SVG (vector format) instead of binary image formats (PNG, JPG, etc.). SVG files are smaller, scalable, and easier to edit.

Do what has been asked; nothing more, nothing less. NEVER create files unless they're absolutely necessary for achieving your goal. ALWAYS prefer editing an existing file to creating a new one. NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
</making_code_changes>
</guidelines>`;
  }

  /**
   * 生成工具使用部分
   */
  private generateToolUsageSection(): string {
    return `<toolcall_guidelines>
Follow these guidelines regarding tool calls
1. You must spare no effort in completing user tasks while maintaining optimal tool call efficiency. Minimize unnecessary calls and prioritize strategies that solve problems efficiently with fewer calls.
2. ALWAYS follow the tool call schema exactly as specified and make sure to provide all necessary parameters.
3. The conversation history may refer to tools that are no longer available. ONLY call tools I gave you in the tool list.
4. NEVER refer to tool names when speaking to the USER. Instead, just say what the tool is doing in natural language.
5. All the required parameters for each tool call must be provided or can reasonably be inferred from context. If you need additional information, prefer collecting via other tool calls over asking the user through calling "attempt_completion" tool.
6. If the user provides a specific value for a parameter (for example provided in quotes), make sure to use that value EXACTLY. DO NOT make up values for or ask about optional parameters. Carefully analyze descriptive terms in the request as they may indicate required parameter values that should be included even if not explicitly quoted.
7. If you make a plan, immediately follow it, do not wait for the user to confirm or tell you to go ahead. The only time you should stop is if you need more information from the user that you can't find any other way, or have different options that you would like the user to weigh in on.
</toolcall_guidelines>`;
  }

  /**
   * 生成用户消息提示
   */
  generateUserPrompt(task: string, images?: string[]): string {
    let prompt = `<user_input>\n${task}\n</user_input>`;
    
    if (images && images.length > 0) {
      const imageSection = images.map((image, index) => 
        `<image_${index + 1}>${image}</image_${index + 1}>`
      ).join('\n');
      prompt = `${imageSection}\n\n${prompt}`;
    }
    
    return prompt;
  }

  /**
   * 获取工具定义的 JSON Schema
   */
  getToolsSchema(): any[] {
    const tools = this.toolRegistry.getAllTools();
    
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }));
  }
}