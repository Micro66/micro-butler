import { BrowserActionTool } from '../../../src/tools/browser/BrowserActionTool';
import { ToolExecutionContext } from '../../../src/types';

describe('BrowserActionTool', () => {
  let tool: BrowserActionTool;
  let mockContext: ToolExecutionContext;
  let mockSecurityManager: any;

  beforeEach(() => {
    tool = new BrowserActionTool();
    mockSecurityManager = {
      validateBrowserAction: jest.fn().mockReturnValue(true)
    };
    mockContext = {
      parameters: {},
      workspacePath: '/test/workspace',
      taskId: 'test-task-id',
      security: {},
      securityManager: mockSecurityManager
    };
    jest.clearAllMocks();
  });

  describe('Tool Properties', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('browser_action');
    });

    it('should have correct description', () => {
      expect(tool.description).toBe('Perform browser automation actions like clicking, typing, and navigation');
    });

    it('should have correct parameters schema', () => {
      expect(tool.parameters.type).toBe('object');
      expect(tool.parameters.properties).toHaveProperty('action');
      expect(tool.parameters.properties).toHaveProperty('url');
      expect(tool.parameters.properties).toHaveProperty('selector');
      expect(tool.parameters.required).toContain('action');
    });
  });

  describe('execute', () => {
    it('should navigate to URL successfully', async () => {
      mockContext.parameters = {
        action: 'navigate',
        url: 'https://example.com'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result.action).toBe('navigate');
      expect(result.result.url).toBe('https://example.com');
      expect(result.result.status).toBe('success');
    });

    it('should take screenshot successfully', async () => {
      mockContext.parameters = {
        action: 'screenshot'
      };
      
      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result.action).toBe('screenshot');
      expect(result.result.status).toBe('success');
      expect(result.result.screenshot_path).toBe('/tmp/screenshot.png');
    });

    it('should click element successfully', async () => {
      mockContext.parameters = {
        action: 'click',
        selector: '#button'
      };
      
      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result.action).toBe('click');
      expect(result.result.selector).toBe('#button');
      expect(result.result.status).toBe('success');
    });

    it('should type text successfully', async () => {
      mockContext.parameters = {
        action: 'type',
        selector: '#input',
        text: 'Hello World'
      };
      
      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result.action).toBe('type');
      expect(result.result.selector).toBe('#input');
      expect(result.result.text).toBe('Hello World');
      expect(result.result.status).toBe('success');
    });

    it('should scroll successfully', async () => {
      mockContext.parameters = {
        action: 'scroll',
        scroll_direction: 'down',
        scroll_amount: 500
      };
      
      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result.action).toBe('scroll');
      expect(result.result.direction).toBe('down');
      expect(result.result.amount).toBe(500);
      expect(result.result.status).toBe('success');
    });

    it('should wait successfully', async () => {
      mockContext.parameters = {
        action: 'wait',
        wait_time: 2000
      };
      
      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result.action).toBe('wait');
      expect(result.result.wait_time).toBe(2000);
      expect(result.result.status).toBe('success');
    });

    it('should get text successfully', async () => {
      mockContext.parameters = {
        action: 'get_text',
        selector: '.content'
      };
      
      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result.action).toBe('get_text');
      expect(result.result.selector).toBe('.content');
      expect(result.result.text).toBe('Sample text content');
      expect(result.result.status).toBe('success');
    });

    it('should get attribute successfully', async () => {
      mockContext.parameters = {
        action: 'get_attribute',
        selector: '#element',
        attribute: 'href'
      };
      
      const result = await tool.execute(mockContext);

      expect(result.success).toBe(true);
      expect(result.result.action).toBe('get_attribute');
      expect(result.result.selector).toBe('#element');
      expect(result.result.attribute).toBe('href');
      expect(result.result.value).toBe('sample-value');
      expect(result.result.status).toBe('success');
    });

    it('should handle missing URL for navigate action', async () => {
      mockContext.parameters = { action: 'navigate' };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('URL is required for navigate action');
    });

    it('should handle missing selector for click action', async () => {
      mockContext.parameters = { action: 'click' };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Selector is required for click action');
    });

    it('should handle missing parameters for type action', async () => {
      mockContext.parameters = { action: 'type', selector: '#input' };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Selector and text are required for type action');
    });

    it('should handle unsupported action', async () => {
      mockContext.parameters = { action: 'unsupported-action' };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported browser action: unsupported-action');
    });

    it('should handle security denial', async () => {
      mockSecurityManager.validateBrowserAction.mockReturnValue(false);
      mockContext.parameters = {
        action: 'navigate',
        url: 'https://example.com'
      };

      const result = await tool.execute(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Browser action denied: navigate');
    });
  });
});