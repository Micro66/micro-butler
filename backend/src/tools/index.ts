import { ToolDefinition } from '@/types';

// 导入所有工具组
import { FileSystemTools } from './filesystem';
import { CommandTools } from './command';
import { BrowserTools } from './browser';
import { InteractionTools } from './interaction';
import { TaskTools } from './task';

// 导出基础工具类
export { BaseTool } from './base/BaseTool';

// 导出所有工具组
export {
  FileSystemTools,
  CommandTools,
  BrowserTools,
  InteractionTools,
  TaskTools
};

// 导出所有具体工具类
export * from './filesystem';
export * from './command';
export * from './browser';
export * from './interaction';
export * from './task';

// 定义工具组接口
export interface ToolGroupInstance {
  name: string;
  description: string;
  tools: ToolDefinition[];
}

/**
 * 获取所有工具组
 */
export function getAllToolGroups(): ToolGroupInstance[] {
  return [
    new FileSystemTools(),
    new CommandTools(),
    new BrowserTools(),
    new InteractionTools(),
    new TaskTools()
  ];
}

/**
 * 根据名称获取工具组
 */
export function getToolGroup(name: string): ToolGroupInstance | undefined {
  const toolGroups = getAllToolGroups();
  return toolGroups.find(group => group.name === name);
}

/**
 * 获取所有工具定义
 */
export function getAllTools(): ToolDefinition[] {
  const toolGroups = getAllToolGroups();
  const allTools: ToolDefinition[] = [];
  
  for (const group of toolGroups) {
    allTools.push(...group.tools);
  }
  
  return allTools;
}

/**
 * 根据名称获取工具定义
 */
export function getTool(name: string): ToolDefinition | undefined {
  const allTools = getAllTools();
  return allTools.find(tool => tool.name === name);
}