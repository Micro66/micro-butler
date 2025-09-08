import type { AgentCard } from '@a2a-js/sdk';

/**
 * Micro Butler Agent Card配置
 * 定义了Agent的基本信息和能力
 */
export const MICRO_BUTLER_AGENT_CARD: AgentCard = {
  name: 'micro-butler',
  version: '1.0.0',
  description: 'AI Programming Assistant with advanced code analysis and automation capabilities',
  url: 'http://localhost:3000',
  protocolVersion: '1.0',
  
  // 默认输入输出模式
  defaultInputModes: ['text/plain', 'application/json'],
  defaultOutputModes: ['text/plain', 'application/json'],
  
  // Agent提供者信息
  provider: {
    organization: 'Roo-Code Team',
    url: 'https://github.com/roo-code/micro-butler'
  },

  // Agent能力定义
  capabilities: {
    // 协议扩展
    extensions: []
  },

  // 技能定义
  skills: [
    {
      id: 'code-analysis',
      name: 'Code Analysis',
      description: 'Analyze code structure, quality, and potential issues',
      tags: ['analysis', 'code-quality', 'static-analysis'],
      inputModes: ['text/plain'],
      outputModes: ['text/plain', 'application/json']
    },
    {
      id: 'code-generation',
      name: 'Code Generation',
      description: 'Generate code based on requirements and specifications',
      tags: ['generation', 'coding', 'automation'],
      inputModes: ['text/plain'],
      outputModes: ['text/plain']
    },
    {
      id: 'debugging',
      name: 'Debugging',
      description: 'Help identify and fix bugs in code',
      tags: ['debugging', 'troubleshooting', 'error-fixing'],
      inputModes: ['text/plain'],
      outputModes: ['text/plain']
    },
    {
      id: 'testing',
      name: 'Testing',
      description: 'Create and run tests for code validation',
      tags: ['testing', 'validation', 'quality-assurance'],
      inputModes: ['text/plain'],
      outputModes: ['text/plain']
    }
  ]
};

/**
 * 创建自定义Agent Card
 */
export function createAgentCard(overrides: Partial<AgentCard>): AgentCard {
  return {
    ...MICRO_BUTLER_AGENT_CARD,
    ...overrides,
    capabilities: {
      ...MICRO_BUTLER_AGENT_CARD.capabilities,
      ...overrides.capabilities
    },
    skills: [
      ...MICRO_BUTLER_AGENT_CARD.skills,
      ...(overrides.skills || [])
    ]
  };
}