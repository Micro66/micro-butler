import { ToolCall, ToolExecutionContext, SecurityConfig } from '@/types';
import { Logger } from 'winston';
import * as path from 'node:path';
import * as os from 'node:os';

export class SecurityManager {
  private config: SecurityConfig;
  private logger: Logger;
  private commandWhitelist: Set<string> = new Set();
  private commandBlacklist: Set<string> = new Set();
  private allowedPaths: Set<string> = new Set();
  private blockedPaths: Set<string> = new Set();

  constructor(config: SecurityConfig = {}, logger?: Logger) {
    this.config = {
      enableSecurity: config.enableSecurity ?? true,
      commandWhitelist: config.commandWhitelist ?? [],
      commandBlacklist: config.commandBlacklist ?? [],
      allowedPaths: config.allowedPaths ?? [],
      blockedPaths: config.blockedPaths ?? [],
      allowedTools: config.allowedTools ?? [],
      blockedTools: config.blockedTools ?? [],
      enforceCommandWhitelist: config.enforceCommandWhitelist ?? true,
      blockSensitiveDirectories: config.blockSensitiveDirectories ?? true
    };
    this.logger = logger || console as any;
    this.initializeSecurityRules();
  }

  /**
   * 初始化安全规则
   */
  private initializeSecurityRules(): void {
    // 初始化命令白名单
    const defaultWhitelist = [
      'ls', 'cat', 'echo', 'pwd', 'cd', 'mkdir', 'touch', 'cp', 'mv', 'rm',
      'grep', 'find', 'head', 'tail', 'wc', 'sort', 'uniq',
      'git', 'npm', 'yarn', 'pnpm', 'node', 'python', 'pip',
      'docker', 'kubectl', 'curl', 'wget'
    ];
    
    const whitelist = this.config.commandWhitelist && this.config.commandWhitelist.length > 0 
      ? this.config.commandWhitelist 
      : defaultWhitelist;
    whitelist.forEach(cmd => this.commandWhitelist.add(cmd));

    // 初始化命令黑名单
    const defaultBlacklist = [
      'rm -rf /', 'sudo', 'su', 'passwd', 'chmod 777', 'chown',
      'mkfs', 'fdisk', 'dd', 'format', 'shutdown', 'reboot',
      'killall', 'pkill', 'systemctl', 'service'
    ];
    
    const blacklist = this.config.commandBlacklist && this.config.commandBlacklist.length > 0
      ? this.config.commandBlacklist
      : defaultBlacklist;
    blacklist.forEach(cmd => this.commandBlacklist.add(cmd));

    // 初始化路径限制
    if (this.config.allowedPaths && this.config.allowedPaths.length > 0) {
      this.config.allowedPaths.forEach(p => this.allowedPaths.add(path.resolve(p)));
    }
    
    if (this.config.blockedPaths && this.config.blockedPaths.length > 0) {
      this.config.blockedPaths.forEach(p => this.blockedPaths.add(path.resolve(p)));
    }

    if (this.logger && typeof this.logger.info === 'function') {
      this.logger.info('Security rules initialized');
    }
  }

  /**
   * 验证工具执行权限
   */
  async validateToolExecution(
    toolCall: ToolCall,
    context: ToolExecutionContext
  ): Promise<void> {
    // 检查工具是否被允许
    if (!this.isToolAllowed(toolCall.name)) {
      throw new Error(`Tool '${toolCall.name}' is not allowed by security policy`);
    }

    // 检查特定工具的参数
    await this.validateToolParameters(toolCall, context);

    this.logger.debug(`Tool '${toolCall.name}' passed security validation`);
  }

  /**
   * 检查工具是否被允许
   */
  private isToolAllowed(toolName: string): boolean {
    // 如果配置了工具白名单，只允许白名单中的工具
    if (this.config.allowedTools && this.config.allowedTools.length > 0) {
      return this.config.allowedTools.includes(toolName);
    }

    // 如果配置了工具黑名单，禁止黑名单中的工具
    if (this.config.blockedTools && this.config.blockedTools.length > 0) {
      return !this.config.blockedTools.includes(toolName);
    }

    // 默认允许所有工具
    return true;
  }

  /**
   * 验证工具参数
   */
  private async validateToolParameters(
    toolCall: ToolCall,
    context: ToolExecutionContext
  ): Promise<void> {
    switch (toolCall.name) {
      case 'run_command':
      case 'execute_command':
        await this.validateCommandExecution(toolCall.parameters);
        break;
      case 'write_to_file':
      case 'update_file':
      case 'view_files':
        await this.validateFileAccess(toolCall.parameters);
        break;
      case 'delete_file':
        await this.validateFileDelete(toolCall.parameters);
        break;
      default:
        // 其他工具的默认验证
        break;
    }
  }

  /**
   * 验证命令执行
   */
  private async validateCommandExecution(parameters: any): Promise<void> {
    const command = parameters.command as string;
    if (!command) {
      throw new Error('Command parameter is required');
    }

    // 提取命令的第一部分（命令名）
    const commandName = command.trim().split(' ')[0];
    
    if (!commandName) {
      throw new Error('Invalid command: command name is empty');
    }

    // 检查命令黑名单
    if (this.commandBlacklist.has(commandName) || this.commandBlacklist.has(command)) {
      throw new Error(`Command '${commandName}' is blocked by security policy`);
    }

    // 检查命令白名单（如果启用）
    if (this.config.enforceCommandWhitelist && this.commandWhitelist.size > 0 && !this.commandWhitelist.has(commandName)) {
      throw new Error(`Command '${commandName}' is not in the allowed command list`);
    }

    // 检查危险模式
    const dangerousPatterns = [
      /rm\s+-rf\s+\//,  // rm -rf /
      /sudo\s+/,        // sudo commands
      /chmod\s+777/,    // chmod 777
      /\|\s*sh/,        // pipe to shell
      /\|\s*bash/,      // pipe to bash
      />`/,             // redirect to file
      /;\s*rm/,         // chained rm commands
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        throw new Error(`Command contains dangerous pattern: ${command}`);
      }
    }
  }

  /**
   * 验证文件访问
   */
  private async validateFileAccess(parameters: any): Promise<void> {
    const filePath = parameters.file_path || parameters.files?.[0]?.file_path;
    if (!filePath) {
      return;
    }

    const resolvedPath = path.resolve(filePath || '');

    // 检查是否在被阻止的路径中
    for (const blockedPath of this.blockedPaths) {
      if (resolvedPath.startsWith(blockedPath)) {
        throw new Error(`Access to path '${resolvedPath}' is blocked by security policy`);
      }
    }

    // 检查是否在允许的路径中（如果配置了）
    if (this.allowedPaths.size > 0) {
      let isAllowed = false;
      for (const allowedPath of this.allowedPaths) {
        if (resolvedPath.startsWith(allowedPath)) {
          isAllowed = true;
          break;
        }
      }
      if (!isAllowed) {
        throw new Error(`Access to path '${resolvedPath}' is not allowed by security policy`);
      }
    }

    // 检查系统敏感目录
    const sensitiveDirectories = [
      '/etc',
      '/var/log',
      '/usr/bin',
      '/usr/sbin',
      '/bin',
      '/sbin',
      path.join(os.homedir(), '.ssh'),
      path.join(os.homedir(), '.aws'),
      path.join(os.homedir(), '.config')
    ];

    for (const sensitiveDir of sensitiveDirectories) {
      if (resolvedPath.startsWith(sensitiveDir)) {
        if (this.logger && typeof this.logger.warn === 'function') {
          this.logger.warn(`Attempting to access sensitive directory: ${resolvedPath}`);
        }
        if (this.config.blockSensitiveDirectories) {
          throw new Error(`Access to sensitive directory '${sensitiveDir}' is blocked`);
        }
      }
    }
  }

  /**
   * 验证文件删除
   */
  private async validateFileDelete(parameters: any): Promise<void> {
    const filePaths = parameters.file_paths || [parameters.file_path];
    
    for (const filePath of filePaths) {
      if (!filePath) continue;
      
      const resolvedPath = path.resolve(filePath);
      
      // 额外的删除保护
      const protectedPatterns = [
        /\/\*$/,           // 通配符删除
        /\.git\//,         // Git 目录
        /node_modules\//,  // Node modules
        /\.env$/,          // 环境变量文件
        /package\.json$/,  // Package.json
      ];
      
      for (const pattern of protectedPatterns) {
        if (pattern.test(resolvedPath)) {
          throw new Error(`Deletion of '${resolvedPath}' is blocked for safety`);
        }
      }
      
      // 使用通用文件访问验证
      await this.validateFileAccess({ file_path: filePath });
    }
  }

  /**
   * 更新安全配置
   */
  updateConfig(newConfig: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.initializeSecurityRules();
    if (this.logger && typeof this.logger.info === 'function') {
      this.logger.info('Security configuration updated');
    }
  }

  /**
   * 获取当前安全配置
   */
  getConfig(): SecurityConfig {
    return { ...this.config };
  }
}