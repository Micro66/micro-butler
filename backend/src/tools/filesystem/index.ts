import { ToolDefinition } from '@/types';
import { ReadFileTool } from './ReadFileTool';
import { WriteFileTool } from './WriteFileTool';
import { SearchFilesTool } from './SearchFilesTool';
import { ListFilesTool } from './ListFilesTool';
import { ListCodeDefinitionNamesTool } from './ListCodeDefinitionNamesTool';
import { InsertContentTool } from './InsertContentTool';
import { SearchAndReplaceTool } from './SearchAndReplaceTool';
import { CreateDirectoryTool } from './CreateDirectoryTool';
import { DeleteFileTool } from './DeleteFileTool';
import { MoveFileTool } from './MoveFileTool';
import { CopyFileTool } from './CopyFileTool';

/**
 * 文件系统工具组
 */
export class FileSystemTools {
  name = 'filesystem';
  description = 'File system operations';
  tools: ToolDefinition[] = [];

  constructor() {
    this.tools = [
      new ReadFileTool().getDefinition(),
      new WriteFileTool().getDefinition(),
      new SearchFilesTool().getDefinition(),
      new ListFilesTool().getDefinition(),
      new ListCodeDefinitionNamesTool().getDefinition(),
      new InsertContentTool().getDefinition(),
      new SearchAndReplaceTool().getDefinition(),
      new CreateDirectoryTool().getDefinition(),
      new DeleteFileTool().getDefinition(),
      new MoveFileTool().getDefinition(),
      new CopyFileTool().getDefinition()
    ];
  }
}

// 导出所有工具类
export {
  ReadFileTool,
  WriteFileTool,
  SearchFilesTool,
  ListFilesTool,
  ListCodeDefinitionNamesTool,
  InsertContentTool,
  SearchAndReplaceTool,
  CreateDirectoryTool,
  DeleteFileTool,
  MoveFileTool,
  CopyFileTool
};