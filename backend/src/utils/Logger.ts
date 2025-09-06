import winston, { Logger as WinstonLogger } from 'winston';
import { LoggingConfig } from '@/types';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 日志上下文
 */
export interface LogContext {
  [key: string]: any;
}

/**
 * 日志格式化器
 */
class LogFormatter {
  /**
   * JSON 格式化器
   */
  static json() {
    return winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
      }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );
  }

  /**
   * 简单格式化器
   */
  static simple() {
    return winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
      }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} [${level.toUpperCase()}] ${message}${metaStr}`;
      })
    );
  }

  /**
   * 彩色格式化器（用于控制台）
   */
  static colorized() {
    return winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS'
      }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} [${level}] ${message}${metaStr}`;
      })
    );
  }
}

/**
 * 日志管理器
 */
export class LoggerManager {
  private static instance: LoggerManager;
  private loggers: Map<string, WinstonLogger> = new Map();
  private config: LoggingConfig;

  private constructor(config: LoggingConfig) {
    this.config = config;
  }

  /**
   * 获取日志管理器实例
   */
  static getInstance(config?: LoggingConfig): LoggerManager {
    if (!LoggerManager.instance) {
      if (!config) {
        throw new Error('LoggerManager config is required for first initialization');
      }
      LoggerManager.instance = new LoggerManager(config);
    }
    return LoggerManager.instance;
  }

  /**
   * 获取或创建日志器
   */
  getLogger(name: string = 'default'): WinstonLogger {
    if (!this.loggers.has(name)) {
      this.loggers.set(name, this.createLogger(name));
    }
    return this.loggers.get(name)!;
  }

  /**
   * 创建日志器
   */
  private createLogger(name: string): WinstonLogger {
    const transports: winston.transport[] = [];

    // 控制台传输
    if (this.config.console?.enabled) {
      const consoleTransport = new winston.transports.Console({
        level: this.config.level || 'info',
        format: LogFormatter.simple()
      });
      transports.push(consoleTransport);
    }

    // 文件传输
    if (this.config.file?.enabled) {
      // 确保日志目录存在
      const logDir = './logs';
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // 普通日志文件
      const logFile = path.join(logDir, `${name}.log`);
      const fileTransport = new winston.transports.File({
        filename: logFile,
        level: this.config.level || 'info',
        format: LogFormatter.simple(),
        maxsize: this.parseSize('10m'),
        maxFiles: 5
      });
      transports.push(fileTransport);

      // 错误日志文件
      const errorFile = path.join(logDir, `${name}.error.log`);
      const errorTransport = new winston.transports.File({
        filename: errorFile,
        level: 'error',
        format: LogFormatter.simple(),
        maxsize: this.parseSize('10m'),
        maxFiles: 5
      });
      transports.push(errorTransport);
    }

    return winston.createLogger({
      level: this.config.level || 'info',
      transports,
      exitOnError: false,
      // 添加默认元数据
      defaultMeta: {
        service: name,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * 解析文件大小字符串
   */
  private parseSize(sizeStr: string): number {
    const match = sizeStr.match(/^(\d+)([kmg]?)b?$/i);
    if (!match) {
      return 10 * 1024 * 1024; // 默认 10MB
    }

    const size = parseInt(match[1] || '0', 10);
    const unit = (match[2] || '').toLowerCase();

    switch (unit) {
      case 'k':
        return size * 1024;
      case 'm':
        return size * 1024 * 1024;
      case 'g':
        return size * 1024 * 1024 * 1024;
      default:
        return size;
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: LoggingConfig): void {
    this.config = config;
    // 清除现有日志器，强制重新创建
    this.loggers.clear();
  }

  /**
   * 关闭所有日志器
   */
  close(): void {
    for (const logger of this.loggers.values()) {
      logger.close();
    }
    this.loggers.clear();
  }
}

/**
 * 应用日志器包装类
 */
export class AppLogger {
  private logger: WinstonLogger;
  private context: LogContext;

  constructor(name: string, context: LogContext = {}) {
    this.logger = LoggerManager.getInstance().getLogger(name);
    this.context = context;
  }

  /**
   * 设置上下文
   */
  setContext(context: LogContext): void {
    this.context = { ...this.context, ...context };
  }

  /**
   * 清除上下文
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * 记录调试信息
   */
  debug(message: string, meta?: LogContext): void {
    this.logger.debug(message, { ...this.context, ...meta });
  }

  /**
   * 记录信息
   */
  info(message: string, meta?: LogContext): void {
    this.logger.info(message, { ...this.context, ...meta });
  }

  /**
   * 记录警告
   */
  warn(message: string, meta?: LogContext): void {
    this.logger.warn(message, { ...this.context, ...meta });
  }

  /**
   * 记录错误
   */
  error(message: string, error?: Error | LogContext, meta?: LogContext): void {
    let errorMeta: LogContext = {};
    
    if (error instanceof Error) {
      errorMeta = {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack
        },
        ...meta
      };
    } else if (error) {
      errorMeta = { ...error, ...meta };
    } else {
      errorMeta = meta || {};
    }
    
    this.logger.error(message, { ...this.context, ...errorMeta });
  }

  /**
   * 创建子日志器
   */
  child(context: LogContext): AppLogger {
    const childLogger = new AppLogger(this.logger.defaultMeta?.service || 'default');
    childLogger.setContext({ ...this.context, ...context });
    return childLogger;
  }

  /**
   * 记录性能指标
   */
  performance(operation: string, duration: number, meta?: LogContext): void {
    this.info(`Performance: ${operation}`, {
      operation,
      duration,
      unit: 'ms',
      ...this.context,
      ...meta
    });
  }

  /**
   * 记录 HTTP 请求
   */
  http(method: string, url: string, statusCode: number, duration: number, meta?: LogContext): void {
    const level = statusCode >= 400 ? 'warn' : 'info';
    this.logger.log(level, `HTTP ${method} ${url}`, {
      http: {
        method,
        url,
        statusCode,
        duration
      },
      ...this.context,
      ...meta
    });
  }

  /**
   * 记录任务事件
   */
  task(taskId: string, event: string, meta?: LogContext): void {
    this.info(`Task ${event}`, {
      task: {
        id: taskId,
        event
      },
      ...this.context,
      ...meta
    });
  }

  /**
   * 记录工具执行
   */
  tool(toolName: string, event: string, meta?: LogContext): void {
    this.info(`Tool ${event}`, {
      tool: {
        name: toolName,
        event
      },
      ...this.context,
      ...meta
    });
  }
}

/**
 * 创建应用日志器
 */
export function createLogger(name: string, context?: LogContext): AppLogger {
  return new AppLogger(name, context);
}

/**
 * 初始化日志系统
 */
export function initializeLogging(config: LoggingConfig): void {
  LoggerManager.getInstance(config);
}

/**
 * 获取默认日志器
 */
export function getLogger(name: string = 'app'): AppLogger {
  return new AppLogger(name);
}

/**
 * 关闭日志系统
 */
export function closeLogging(): void {
  LoggerManager.getInstance().close();
}