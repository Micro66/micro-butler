#!/usr/bin/env node

// Configure module-alias for path mapping
import 'module-alias/register';
import * as moduleAlias from 'module-alias';
import * as path from 'path';

// Setup path aliases
moduleAlias.addAliases({
  '@': path.join(__dirname),
  '@/types': path.join(__dirname, 'types'),
  '@/core': path.join(__dirname, 'core'),
  '@/api': path.join(__dirname, 'api'),
  '@/utils': path.join(__dirname, 'utils'),
  '@/config': path.join(__dirname, 'config'),
  '@/tools': path.join(__dirname, 'tools'),
  '@/shared': path.join(__dirname, 'shared'),
  '@/storage': path.join(__dirname, 'storage')
});

import { startApp } from './server';
import { initializeLogging, getLogger } from './utils/Logger';

// 先初始化Logger系统
initializeLogging({
  level: (process.env.LOG_LEVEL as 'info' | 'error' | 'warn' | 'debug') || 'info',
  format: 'simple',
  console: {
    enabled: true,
    level: 'info'
  }
});

const logger = getLogger('main');

/**
 * 主入口函数
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting Roo Code Backend Service...');
    
    // 从环境变量或命令行参数获取配置路径
    const configPath = process.env.CONFIG_PATH || process.argv[2];
    
    // 启动应用服务器
    const server = await startApp(configPath);
    
    // 设置优雅关闭处理
    setupGracefulShutdown(server);
    
    logger.info('Roo Code Backend Service started successfully');
    
    // 输出服务信息
    console.log('\n🚀 Roo Code Backend Service is running!');
    console.log('📊 Health check: http://localhost:3000/health');
    console.log('🔌 WebSocket: ws://localhost:3000/ws');
    console.log('📖 API Documentation: http://localhost:3000/api/docs (if enabled)');
    console.log('\n💡 Press Ctrl+C to stop the service\n');
    
  } catch (error) {
    logger.error('Failed to start Roo Code Backend Service', error as Error);
    console.error('❌ Failed to start service:', error);
    process.exit(1);
  }
}

/**
 * 设置优雅关闭处理
 */
function setupGracefulShutdown(server: any): void {
  const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
  
  signals.forEach((signal) => {
    process.on(signal, async () => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
      
      try {
        await server.stop();
        logger.info('Service stopped successfully');
        console.log('✅ Service stopped successfully');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', error as Error);
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    });
  });
  
  // 处理未捕获的异常
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    console.error('❌ Uncaught exception:', error);
    process.exit(1);
  });
  
  // 处理未处理的 Promise 拒绝
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', reason as Error, { promise });
    console.error('❌ Unhandled rejection:', reason);
    process.exit(1);
  });
}

// 如果直接运行此文件，执行主函数
if (require.main === module) {
  main();
}

export { main, startApp };