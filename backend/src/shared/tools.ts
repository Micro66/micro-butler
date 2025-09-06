import { ToolGroup } from '../types/index.js';

/**
 * 工具组配置接口
 */
export interface ToolGroupConfig {
  tools: readonly string[];
  alwaysAvailable?: boolean;
}

/**
 * 工具组定义，映射每个工具组包含的具体工具
 */
export const TOOL_GROUPS: Record<ToolGroup, ToolGroupConfig> = {
  read: {
    tools: [
      'read_file',
      'fetch_instructions', 
      'search_files',
      'list_files',
      'list_code_definition_names',
      'codebase_search'
    ]
  },
  edit: {
    tools: ['apply_diff', 'write_to_file', 'insert_content', 'search_and_replace']
  },
  browser: {
    tools: ['browser_action']
  },
  command: {
    tools: ['execute_command']
  },
  mcp: {
    tools: ['use_mcp_tool', 'access_mcp_resource']
  }
};

/**
 * 总是可用的工具列表
 * 这些工具在所有模式下都可以使用
 */
export const ALWAYS_AVAILABLE_TOOLS: readonly string[] = [
  'ask_followup_question',
  'attempt_completion',
  'switch_mode',
  'new_task',
  'update_todo_list',
  'run_slash_command'
] as const;

/**
 * Diff策略枚举
 */
export enum DiffStrategy {
  UNIFIED = 'unified',
  CONTEXT = 'context',
  SIDE_BY_SIDE = 'side-by-side'
}

/**
 * 获取工具组中的所有工具
 */
export function getToolsInGroup(groupName: ToolGroup): readonly string[] {
  return TOOL_GROUPS[groupName]?.tools || [];
}

/**
 * 检查工具是否属于指定工具组
 */
export function isToolInGroup(toolName: string, groupName: ToolGroup): boolean {
  return TOOL_GROUPS[groupName]?.tools.includes(toolName) || false;
}

/**
 * 检查工具是否总是可用
 */
export function isAlwaysAvailableTool(toolName: string): boolean {
  return ALWAYS_AVAILABLE_TOOLS.includes(toolName);
}

/**
 * 获取所有工具组名称
 */
export function getAllToolGroups(): ToolGroup[] {
  return Object.keys(TOOL_GROUPS) as ToolGroup[];
}

/**
 * 根据模式获取可用的工具
 * 这是一个简化版本，实际实现应该根据具体的模式配置来确定
 */
export function getToolsForMode(mode: string): string[] {
  // 简化实现：返回所有工具组的工具加上总是可用的工具
  const allTools = new Set<string>();
  
  // 添加所有工具组的工具
  Object.values(TOOL_GROUPS).forEach(group => {
    group.tools.forEach(tool => allTools.add(tool));
  });
  
  // 添加总是可用的工具
  ALWAYS_AVAILABLE_TOOLS.forEach(tool => allTools.add(tool));
  
  return Array.from(allTools);
}

/**
 * 工具使用统计接口
 */
export interface ToolUsageStats {
  toolName: string;
  usageCount: number;
  lastUsed: Date;
  averageExecutionTime: number;
  successRate: number;
}

/**
 * 工具配置选项
 */
export interface ToolOptions {
  timeout?: number;
  retries?: number;
  validateInput?: boolean;
  logExecution?: boolean;
}

/**
 * 默认工具选项
 */
export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  timeout: 30000, // 30秒
  retries: 3,
  validateInput: true,
  logExecution: true
};