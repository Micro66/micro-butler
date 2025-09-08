import { Message } from '../../../../../libs/a2a-js/src/types';
import { WorkerAgent, SkillResult } from '../WorkerAgent';

interface TestGenerationRequest {
  type: 'unit' | 'integration' | 'e2e';
  code?: string;
  filePath?: string;
  framework?: 'jest' | 'mocha' | 'vitest';
  coverage?: boolean;
}

interface TestGenerationResponse {
  testCode: string;
  testFilePath: string;
  coverage?: number;
  suggestions?: string[];
}

export class TestGenerationAgent extends WorkerAgent {
  constructor() {
    super('test-generation-agent', 'Test Generation Agent', ['testing', 'code-analysis']);
  }

  protected async initializeSkills(): Promise<void> {
    await this.registerSkill({
      id: 'generate-unit-tests',
      name: 'generate-unit-tests',
      description: 'Generate unit tests for code',
      tags: ['testing', 'unit'],
      inputModes: ['text'],
      outputModes: ['text'],
      execute: async (message: Message): Promise<SkillResult> => {
        return this.generateUnitTests(message);
      }
    });

    await this.registerSkill({
      id: 'generate-integration-tests',
      name: 'generate-integration-tests',
      description: 'Generate integration tests',
      tags: ['testing', 'integration'],
      inputModes: ['text'],
      outputModes: ['text'],
      execute: async (message: Message): Promise<SkillResult> => {
        return this.generateIntegrationTests(message);
      }
    });

    await this.registerSkill({
      id: 'analyze-test-coverage',
      name: 'analyze-test-coverage',
      description: 'Analyze test coverage and suggest improvements',
      tags: ['testing', 'coverage'],
      inputModes: ['text'],
      outputModes: ['text'],
      execute: async (message: Message): Promise<SkillResult> => {
        return this.analyzeTestCoverage(message);
      }
    });
  }

  private async generateUnitTests(message: Message): Promise<SkillResult> {
    try {
      const request = JSON.parse(message.parts.find((part: any) => part.kind === 'text')?.text || '{}') as TestGenerationRequest;
      const code = await this.getCodeContent(request);
      
      const testCode = await this.generateTestsForCode(code, 'unit', request.framework || 'jest');
      const testFilePath = this.generateTestFilePath(request.filePath || 'unknown.ts', 'unit');
      
      return {
        success: true,
        result: {
          testCode,
          testFilePath,
          suggestions: await this.generateTestSuggestions(code, testCode)
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async generateIntegrationTests(message: Message): Promise<SkillResult> {
    try {
      const request = JSON.parse(message.parts.find((part: any) => part.kind === 'text')?.text || '{}') as TestGenerationRequest;
      const code = await this.getCodeContent(request);
      
      const testCode = await this.generateTestsForCode(code, 'integration', request.framework || 'jest');
      const testFilePath = this.generateTestFilePath(request.filePath || 'unknown.ts', 'integration');
      
      return {
        success: true,
        result: {
          testCode,
          testFilePath,
          suggestions: await this.generateTestSuggestions(code, testCode)
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async analyzeTestCoverage(message: Message): Promise<SkillResult> {
    try {
      const request = JSON.parse(message.parts.find((part: any) => part.kind === 'text')?.text || '{}') as TestGenerationRequest;
      const code = await this.getCodeContent(request);
      
      const coverage = await this.calculateTestCoverage(code);
      const suggestions = await this.generateCoverageSuggestions(code, coverage);
      
      return {
        success: true,
        result: {
          testCode: '',
          testFilePath: '',
          coverage,
          suggestions
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async getCodeContent(request: TestGenerationRequest): Promise<string> {
    if (request.code) {
      return request.code;
    }
    
    if (request.filePath) {
      // In a real implementation, read from file system
      return `// Code from ${request.filePath}`;
    }
    
    throw new Error('No code content provided');
  }

  private async generateTestsForCode(code: string, testType: string, framework: string): Promise<string> {
    // Simplified test generation logic
    const lines = code.split('\n');
    const functions = lines.filter(line => line.includes('function') || line.includes('=>'));
    const classes = lines.filter(line => line.includes('class '));
    
    let testCode = `// Generated ${testType} tests using ${framework}\n\n`;
    
    if (framework === 'jest') {
      testCode += `import { describe, it, expect } from '@jest/globals';\n\n`;
    }
    
    // Generate tests for classes
    classes.forEach(cls => {
      const className = cls.match(/class\s+(\w+)/)?.[1] || 'Unknown';
      testCode += `describe('${className}', () => {\n`;
      testCode += `  it('should be defined', () => {\n`;
      testCode += `    expect(${className}).toBeDefined();\n`;
      testCode += `  });\n\n`;
      
      // Add more specific tests based on methods found
      const methods = lines.filter(line => line.includes('public ') || line.includes('private '));
      methods.forEach(method => {
        const methodName = method.match(/(public|private)\s+(\w+)/)?.[2];
        if (methodName) {
          testCode += `  it('should test ${methodName}', () => {\n`;
          testCode += `    // TODO: Implement test for ${methodName}\n`;
          testCode += `  });\n\n`;
        }
      });
      
      testCode += `});\n\n`;
    });
    
    // Generate tests for functions
    functions.forEach(func => {
      const funcName = func.match(/function\s+(\w+)|const\s+(\w+)\s*=/)?.[1] || func.match(/const\s+(\w+)\s*=/)?.[1] || 'Unknown';
      testCode += `describe('${funcName}', () => {\n`;
      testCode += `  it('should work correctly', () => {\n`;
      testCode += `    // TODO: Implement test for ${funcName}\n`;
      testCode += `  });\n`;
      testCode += `});\n\n`;
    });
    
    return testCode;
  }

  private generateTestFilePath(originalPath: string, testType: string): string {
    const pathParts = originalPath.split('.');
    const extension = pathParts.pop();
    const baseName = pathParts.join('.');
    
    return `${baseName}.${testType}.test.${extension}`;
  }

  private async generateTestSuggestions(code: string, testCode: string): Promise<string[]> {
    const suggestions: string[] = [];
    
    // Check for edge cases
    if (code.includes('if') && !testCode.includes('edge case')) {
      suggestions.push('Consider adding tests for edge cases and conditional branches');
    }
    
    // Check for error handling
    if (code.includes('throw') && !testCode.includes('toThrow')) {
      suggestions.push('Add tests for error handling scenarios');
    }
    
    // Check for async code
    if (code.includes('async') && !testCode.includes('await')) {
      suggestions.push('Ensure async functions are properly tested with await');
    }
    
    // Check for mocking needs
    if (code.includes('import') && !testCode.includes('mock')) {
      suggestions.push('Consider mocking external dependencies');
    }
    
    return suggestions;
  }

  private async calculateTestCoverage(code: string): Promise<number> {
    // Simplified coverage calculation
    const lines = code.split('\n').filter(line => line.trim() && !line.trim().startsWith('//')).length;
    const functions = code.split('\n').filter(line => line.includes('function') || line.includes('=>')).length;
    const branches = code.split('\n').filter(line => line.includes('if') || line.includes('switch')).length;
    
    // Mock coverage calculation - in real implementation, this would use actual coverage tools
    const mockCoverage = Math.max(0, Math.min(100, 60 + Math.random() * 30));
    
    return Math.round(mockCoverage);
  }

  private async generateCoverageSuggestions(code: string, coverage: number): Promise<string[]> {
    const suggestions: string[] = [];
    
    if (coverage < 80) {
      suggestions.push('Test coverage is below 80%. Consider adding more comprehensive tests.');
    }
    
    if (code.includes('if') || code.includes('switch')) {
      suggestions.push('Ensure all conditional branches are tested.');
    }
    
    if (code.includes('catch') || code.includes('throw')) {
      suggestions.push('Add tests for error handling paths.');
    }
    
    if (code.includes('async')) {
      suggestions.push('Test both successful and failed async operations.');
    }
    
    return suggestions;
  }
}

export function createTestGenerationAgent(): TestGenerationAgent {
  return new TestGenerationAgent();
}