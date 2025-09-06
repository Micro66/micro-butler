import { AppConfig, ApiConfiguration, SecurityConfig, ServerConfig, StorageConfig, LoggingConfig, ApiProvider } from '@/types';
import { Logger } from 'winston';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export class ConfigManager {
  private config: AppConfig;
  private logger: Logger;
  private configPath: string;
  private watchers: Map<string, fs.FSWatcher> = new Map();

  constructor(configPath?: string, logger?: Logger) {
    this.configPath = configPath || this.getDefaultConfigPath();
    this.logger = logger || console as any;
    this.config = this.loadConfig();
  }

  /**
   * 获取默认配置文件路径
   */
  private getDefaultConfigPath(): string {
    // 优先从用户主目录读取配置
    const userConfigPath = path.join(os.homedir(), '.micro-butler', 'config', 'app.json');
    if (fs.existsSync(userConfigPath)) {
      return userConfigPath;
    }
    
    // 回退到环境变量或项目目录
    const configDir = process.env.CONFIG_DIR || path.join(process.cwd(), 'config');
    return path.join(configDir, 'app.json');
  }

  /**
   * 加载配置
   */
  private loadConfig(): AppConfig {
    try {
      // 首先尝试从环境变量加载配置
      const envConfig = this.loadFromEnvironment();
      
      // 然后尝试从配置文件加载
      let fileConfig: Partial<AppConfig> = {};
      if (fs.existsSync(this.configPath)) {
        const configContent = fs.readFileSync(this.configPath, 'utf-8');
        fileConfig = JSON.parse(configContent);
      }
      
      // 合并默认配置、文件配置和环境变量配置
      const defaultConfig = this.getDefaultConfig();
      const mergedConfig = this.mergeConfigs(defaultConfig, fileConfig, envConfig);
      
      this.validateConfig(mergedConfig);
      
      if (this.logger) {
        this.logger.info('Configuration loaded successfully', {
          configPath: this.configPath,
          hasFileConfig: Object.keys(fileConfig).length > 0,
          hasEnvConfig: Object.keys(envConfig).length > 0
        });
      }
      
      return mergedConfig;
    } catch (error) {
      const errorMessage = `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`;
      if (this.logger) {
        this.logger.error(errorMessage);
      } else {
        console.error(errorMessage);
      }
      
      // 返回默认配置作为后备
      return this.getDefaultConfig();
    }
  }

  /**
   * 从环境变量加载配置
   */
  private loadFromEnvironment(): Partial<AppConfig> {
    const envConfig: Partial<AppConfig> = {};
    
    // 服务器配置
    if (process.env.PORT) {
      envConfig.server = {
        ...envConfig.server,
        port: parseInt(process.env.PORT, 10)
      };
    }
    
    if (process.env.HOST) {
      envConfig.server = {
        ...envConfig.server,
        host: process.env.HOST
      };
    }
    
    // API 配置
    if (process.env.DEFAULT_API_PROVIDER) {
      envConfig.defaultApiConfiguration = {
        ...envConfig.defaultApiConfiguration,
        provider: process.env.DEFAULT_API_PROVIDER as 'anthropic' | 'openai' | 'google'
      };
    }
    
    if (process.env.DEFAULT_API_KEY) {
      envConfig.defaultApiConfiguration = {
        ...envConfig.defaultApiConfiguration,
        apiKey: process.env.DEFAULT_API_KEY
      };
    }
    
    if (process.env.DEFAULT_MODEL) {
      envConfig.defaultApiConfiguration = {
        ...envConfig.defaultApiConfiguration,
        apiModelId: process.env.DEFAULT_MODEL
      };
    }
    
    // 存储配置
    if (process.env.STORAGE_TYPE) {
      envConfig.storage = {
        ...envConfig.storage,
        type: process.env.STORAGE_TYPE as 'file' | 'redis' | 'mongodb'
      };
    }
    
    if (process.env.STORAGE_PATH) {
      envConfig.storage = {
        ...envConfig.storage,
        path: process.env.STORAGE_PATH
      };
    }
    
    // 日志配置
    if (process.env.LOG_LEVEL) {
      const logLevel = process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug';
      if (['error', 'warn', 'info', 'debug'].includes(logLevel)) {
        envConfig.logging = {
          ...envConfig.logging,
          level: logLevel
        };
      }
    }
    
    return envConfig;
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): AppConfig {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        cors: {
          enabled: true,
          origins: ['*'],
          methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization']
        }
      },
      api: {
        timeout: 30000,
        rateLimit: {
          windowMs: 15 * 60 * 1000, // 15 minutes
          max: 100 // limit each IP to 100 requests per windowMs
        }
      },
      defaultApiConfiguration: {
          provider: 'siliconflow',
          apiModelId: 'Qwen/QwQ-32B',
          apiKey: '',
          maxTokens: 4096,
          temperature: 0.7
        },
        security: {
        enableSecurity: true,
        allowedTools: [],
        blockedTools: [],
        commandWhitelist: [],
        commandBlacklist: [],
        allowedPaths: [],
        blockedPaths: [],
        enforceCommandWhitelist: false,
        blockSensitiveDirectories: true
      },
      storage: {
        type: 'file',
        path: path.join(os.tmpdir(), 'micro-butler-backend'),
        maxTaskHistory: 1000,
        cleanupInterval: 24 * 60 * 60 * 1000 // 24 hours
      },
      logging: {
        level: 'info',
        format: 'json',
        file: {
          enabled: true,
          level: 'info',
          filename: path.join(process.cwd(), 'logs', 'app.log'),
          maxSize: '10m',
          maxFiles: 5
        },
        console: {
          enabled: true,
          level: 'info'
        }
      }
    };
  }

  /**
   * 合并配置对象
   */
  private mergeConfigs(...configs: Partial<AppConfig>[]): AppConfig {
    const result = {} as AppConfig;
    
    for (const config of configs) {
      this.deepMerge(result, config);
    }
    
    return result;
  }

  /**
   * 深度合并对象
   */
  private deepMerge(target: any, source: any): void {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key]) {
          target[key] = {};
        }
        this.deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }

  /**
   * 验证配置
   */
  private validateConfig(config: AppConfig): void {
    // 验证服务器配置
    if (!config.server?.port || config.server.port < 1 || config.server.port > 65535) {
      throw new Error('Invalid server port configuration');
    }
    
    // 验证 API 配置
    if (!config.defaultApiConfiguration?.provider) {
      throw new Error('Default API provider is required');
    }
    
    if (!config.defaultApiConfiguration?.apiModelId) {
      throw new Error('Default API model is required');
    }
    
    // 验证存储配置
    if (!config.storage?.type) {
      throw new Error('Storage type is required');
    }
    
    if (!config.storage?.path) {
      throw new Error('Storage path is required');
    }
  }

  /**
   * 获取完整配置
   */
  public getConfig(): AppConfig {
    return { ...this.config };
  }

  /**
   * 获取服务器配置
   */
  public getServerConfig(): ServerConfig {
    return { ...this.config.server };
  }

  /**
   * 获取默认 API 配置
   */
  public getDefaultApiConfiguration(): ApiConfiguration {
    return this.config.defaultApiConfiguration;
  }

  /**
   * 获取指定提供商的API配置
   */
  public getApiConfiguration(provider: string): ApiConfiguration | undefined {
    if (!this.config.apiConfigurations) {
      return undefined;
    }
    return this.config.apiConfigurations[provider as ApiProvider];
  }

  /**
   * 获取所有API配置
   */
  public getAllApiConfigurations(): Record<string, ApiConfiguration> {
    return this.config.apiConfigurations || {};
  }

  /**
   * 设置指定提供商的API配置
   */
  public setApiConfiguration(provider: string, config: ApiConfiguration): void {
    if (!this.config.apiConfigurations) {
      this.config.apiConfigurations = {};
    }
    (this.config.apiConfigurations as Record<string, ApiConfiguration>)[provider] = config;
    this.saveConfig();
  }

  /**
   * 删除指定提供商的API配置
   */
  public removeApiConfiguration(provider: string): void {
    if (this.config.apiConfigurations) {
      delete (this.config.apiConfigurations as Record<string, ApiConfiguration>)[provider];
      this.saveConfig();
    }
  }

  /**
   * 获取安全配置
   */
  public getSecurityConfig(): SecurityConfig {
    return { ...this.config.security };
  }

  /**
   * 获取存储配置
   */
  public getStorageConfig(): StorageConfig {
    return { ...this.config.storage };
  }

  /**
   * 获取日志配置
   */
  public getLoggingConfig(): LoggingConfig {
    return { ...this.config.logging };
  }

  /**
   * 更新配置
   */
  public updateConfig(updates: Partial<AppConfig>): void {
    const newConfig = this.mergeConfigs(this.config, updates);
    this.validateConfig(newConfig);
    this.config = newConfig;
    
    if (this.logger) {
      this.logger.info('Configuration updated', { updates });
    }
  }

  /**
   * 保存配置到文件
   */
  public saveConfig(): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
      
      if (this.logger) {
        this.logger.info('Configuration saved', { configPath: this.configPath });
      }
    } catch (error) {
      const errorMessage = `Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`;
      if (this.logger) {
        this.logger.error(errorMessage);
      }
      throw new Error(errorMessage);
    }
  }

  /**
   * 监听配置文件变化
   */
  public watchConfig(callback?: (config: AppConfig) => void): void {
    if (this.watchers.has(this.configPath)) {
      return; // 已经在监听
    }
    
    try {
      const watcher = fs.watch(this.configPath, (eventType) => {
        if (eventType === 'change') {
          try {
            const newConfig = this.loadConfig();
            this.config = newConfig;
            
            if (this.logger) {
              this.logger.info('Configuration reloaded due to file change');
            }
            
            if (callback) {
              callback(newConfig);
            }
          } catch (error) {
            if (this.logger) {
              this.logger.error('Failed to reload configuration', { error });
            }
          }
        }
      });
      
      this.watchers.set(this.configPath, watcher);
      
      if (this.logger) {
        this.logger.info('Started watching configuration file', { configPath: this.configPath });
      }
    } catch (error) {
      if (this.logger) {
        this.logger.warn('Failed to watch configuration file', { error, configPath: this.configPath });
      }
    }
  }

  /**
   * 停止监听配置文件
   */
  public unwatchConfig(): void {
    const watcher = this.watchers.get(this.configPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(this.configPath);
      
      if (this.logger) {
        this.logger.info('Stopped watching configuration file', { configPath: this.configPath });
      }
    }
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    for (const [path, watcher] of this.watchers.entries()) {
      watcher.close();
    }
    this.watchers.clear();
  }
}