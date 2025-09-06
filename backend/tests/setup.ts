// Jest setup file
import 'module-alias/register';

// Initialize LoggerManager for tests
import { LoggerManager } from '../src/utils/Logger';

// Initialize LoggerManager with test config
LoggerManager.getInstance({
  level: 'error',
  format: 'simple',
  console: {
    enabled: false,
    level: 'error'
  },
  file: {
    enabled: false,
    level: 'error',
    filename: 'test.log',
    maxSize: '1m',
    maxFiles: 1
  }
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';