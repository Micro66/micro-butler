import { Message } from '../../../../../libs/a2a-js/src/types';
import { WorkerAgent, SkillResult } from '../WorkerAgent';
import { Logger } from '../../../utils/Logger';

interface DocumentationRequest {
  type: 'generate' | 'update' | 'review';
  code?: string;
  filePath?: string;
  existingDocs?: string;
  format?: 'markdown' | 'jsdoc' | 'typescript';
}

interface DocumentationResponse {
  documentation: string;
  suggestions?: string[];
  coverage?: number;
}

export class DocumentationAgent extends WorkerAgent {
  constructor(logger: Logger) {
    super('documentation-agent', 'Documentation Agent', ['documentation', 'code-analysis'], logger);
  }

  protected async initializeSkills(): Promise<void> {
    await this.registerSkill({
      id: 'generate-documentation',
      name: 'generate-documentation',
      description: 'Generate documentation for code',
      tags: ['documentation'],
      inputModes: ['text'],
      outputModes: ['text'],
      execute: async (message: Message): Promise<SkillResult> => {
        return this.generateDocumentation(message);
      }
    });

    await this.registerSkill({
      id: 'update-documentation',
      name: 'update-documentation', 
      description: 'Update existing documentation',
      tags: ['documentation'],
      inputModes: ['text'],
      outputModes: ['text'],
      execute: async (message: Message): Promise<SkillResult> => {
        return this.updateDocumentation(message);
      }
    });

    await this.registerSkill({
      id: 'review-documentation',
      name: 'review-documentation',
      description: 'Review documentation quality and completeness',
      tags: ['documentation'],
      inputModes: ['text'],
      outputModes: ['text'],
      execute: async (message: Message): Promise<SkillResult> => {
        return this.reviewDocumentation(message);
      }
    });
  }

  private async generateDocumentation(message: Message): Promise<SkillResult> {
    try {
      const request = JSON.parse(message.parts.find((part: any) => part.kind === 'text')?.text || '{}') as DocumentationRequest;
      const code = await this.getCodeContent(request);
      
      const documentation = await this.analyzeAndGenerateDoc(code, request.format || 'markdown');
      
      return {
        success: true,
        result: {
          documentation,
          coverage: this.calculateDocCoverage(code, documentation)
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async updateDocumentation(message: Message): Promise<SkillResult> {
    try {
      const request = JSON.parse(message.parts.find((part: any) => part.kind === 'text')?.text || '{}') as DocumentationRequest;
      const code = await this.getCodeContent(request);
      
      const updatedDoc = await this.updateExistingDoc(code, request.existingDocs || '', request.format || 'markdown');
      
      return {
        success: true,
        result: {
          documentation: updatedDoc,
          suggestions: await this.generateImprovementSuggestions(updatedDoc),
          coverage: this.calculateDocCoverage(code, updatedDoc)
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async reviewDocumentation(message: Message): Promise<SkillResult> {
    try {
      const request = JSON.parse(message.parts.find((part: any) => part.kind === 'text')?.text || '{}') as DocumentationRequest;
      const code = await this.getCodeContent(request);
      
      const review = await this.performDocReview(code, request.existingDocs || '');
      
      return {
        success: true,
        result: {
          documentation: request.existingDocs || '',
          suggestions: review.suggestions,
          coverage: review.coverage
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async getCodeContent(request: DocumentationRequest): Promise<string> {
    if (request.code) {
      return request.code;
    }
    
    if (request.filePath) {
      // In a real implementation, read from file system
      return `// Code from ${request.filePath}`;
    }
    
    throw new Error('No code content provided');
  }

  private async analyzeAndGenerateDoc(code: string, format: string): Promise<string> {
    // Simplified documentation generation logic
    const lines = code.split('\n');
    const functions = lines.filter(line => line.includes('function') || line.includes('=>'));
    const classes = lines.filter(line => line.includes('class '));
    
    let doc = `# Code Documentation\n\n`;
    
    if (classes.length > 0) {
      doc += `## Classes\n\n`;
      classes.forEach(cls => {
        const className = cls.match(/class\s+(\w+)/)?.[1] || 'Unknown';
        doc += `### ${className}\n\nDescription of ${className} class.\n\n`;
      });
    }
    
    if (functions.length > 0) {
      doc += `## Functions\n\n`;
      functions.forEach(func => {
        const funcName = func.match(/function\s+(\w+)|const\s+(\w+)\s*=/)?.[1] || func.match(/const\s+(\w+)\s*=/)?.[1] || 'Unknown';
        doc += `### ${funcName}\n\nDescription of ${funcName} function.\n\n`;
      });
    }
    
    return doc;
  }

  private async updateExistingDoc(code: string, existingDoc: string, format: string): Promise<string> {
    // Simplified update logic - merge new analysis with existing doc
    const newDoc = await this.analyzeAndGenerateDoc(code, format);
    return `${existingDoc}\n\n## Updated Sections\n\n${newDoc}`;
  }

  private async performDocReview(code: string, documentation: string): Promise<{ suggestions: string[], coverage: number }> {
    const suggestions: string[] = [];
    
    // Check for missing function documentation
    const functions = code.split('\n').filter(line => line.includes('function') || line.includes('=>'));
    const documentedFunctions = documentation.split('\n').filter(line => line.includes('###'));
    
    if (functions.length > documentedFunctions.length) {
      suggestions.push('Some functions are missing documentation');
    }
    
    // Check for parameter documentation
    if (!documentation.includes('@param') && functions.length > 0) {
      suggestions.push('Consider adding parameter documentation');
    }
    
    // Check for return value documentation
    if (!documentation.includes('@returns') && functions.length > 0) {
      suggestions.push('Consider adding return value documentation');
    }
    
    const coverage = this.calculateDocCoverage(code, documentation);
    
    return { suggestions, coverage };
  }

  private calculateDocCoverage(code: string, documentation: string): number {
    const codeElements = code.split('\n').filter(line => 
      line.includes('function') || 
      line.includes('class ') || 
      line.includes('interface ') ||
      line.includes('type ')
    ).length;
    
    const documentedElements = documentation.split('\n').filter(line => 
      line.includes('###') || line.includes('##')
    ).length;
    
    return codeElements > 0 ? Math.round((documentedElements / codeElements) * 100) : 0;
  }

  private async generateImprovementSuggestions(documentation: string): Promise<string[]> {
    const suggestions: string[] = [];
    
    if (!documentation.includes('Example')) {
      suggestions.push('Consider adding usage examples');
    }
    
    if (!documentation.includes('@param')) {
      suggestions.push('Add parameter descriptions');
    }
    
    if (!documentation.includes('@returns')) {
      suggestions.push('Add return value descriptions');
    }
    
    return suggestions;
  }
}

export function createDocumentationAgent(logger: Logger): DocumentationAgent {
  return new DocumentationAgent(logger);
}