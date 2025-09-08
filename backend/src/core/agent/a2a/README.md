# A2A (Agent-to-Agent) System Implementation

This directory contains the implementation of the Agent-to-Agent communication system for the Micro-Butler backend, enabling autonomous agent collaboration and task delegation.

## Architecture Overview

The A2A system consists of several key components:

### Core Components

1. **A2ASystem** - Main system orchestrator
2. **AgentRegistry** - Manages agent lifecycle and registration
3. **AgentDiscovery** - Handles agent discovery and service registry
4. **WorkerAgent** - Base class for worker agents with skill registration
5. **LeaderAgent** - Coordinates tasks and delegates to worker agents

### Agent Implementations

- **CodeAnalysisAgent** - Analyzes code structure, detects issues, and calculates complexity
- **DocumentationAgent** - Generates, updates, and reviews documentation
- **TestGenerationAgent** - Creates unit tests, integration tests, and analyzes coverage

## Key Features

### Agent Discovery
- Automatic agent registration and heartbeat monitoring
- Skill-based agent discovery
- Load balancing and health checking
- Agent Card specification compliance

### Task Delegation
- Leader agent coordinates complex workflows
- Automatic skill matching for task assignment
- Concurrent task execution with load management
- Error handling and retry mechanisms

### Skill System
- Modular skill registration for worker agents
- Standardized skill execution interface
- Input/output mode specification
- Skill tagging and categorization

## Usage Examples

### Basic System Initialization

```typescript
import { getA2ASystem, initializeEnhancedA2ASystem } from './index';

// Initialize the A2A system
const a2aSystem = getA2ASystem({
  port: 3001,
  host: 'localhost',
  enableDiscovery: true
});

await a2aSystem.initialize();
await a2aSystem.start();
```

### Adding Custom Agents

```typescript
import { createCodeAnalysisAgent } from './agents/CodeAnalysisAgent';

// Create and register a code analysis agent
const codeAgent = createCodeAnalysisAgent(
  logger,
  taskManager,
  workspaceRoot,
  { maxConcurrentTasks: 5 }
);

await a2aSystem.addAgent(codeAgent, {
  id: 'code-analysis-1',
  name: 'Code Analysis Agent',
  type: 'worker',
  capabilities: ['code-analysis', 'structure-analysis', 'issue-detection'],
  autoStart: true
});
```

### Task Execution

```typescript
// Execute a task through the leader agent
const result = await a2aSystem.executeTask({
  type: 'code-analysis',
  description: 'Analyze the main application file',
  requirements: ['structure-analysis', 'issue-detection'],
  data: {
    filePath: '/src/app.ts',
    analysisType: 'comprehensive'
  }
});
```

### Health Monitoring

```typescript
import { createCombinedHealthCheck } from './index';

// Add health check endpoint to Express app
app.get('/health/a2a', createCombinedHealthCheck());
```

## Integration with Micro-Butler Backend

The A2A system integrates with the existing backend through:

1. **Express Middleware** - Adds A2A system to request context
2. **Health Endpoints** - Monitors system and agent status
3. **Task Manager Integration** - Leverages existing task management
4. **Logger Integration** - Uses Winston for consistent logging

### Integration Example

```typescript
import { initializeEnhancedA2ASystem, createCombinedHealthCheck } from '@/core/agent/a2a';

// In your main application setup
const { legacySystem, newSystem } = await initializeEnhancedA2ASystem(
  logger,
  taskManager,
  {
    server: { port: 3001 },
    newSystem: { enableDiscovery: true }
  }
);

// Start both systems
await legacySystem.start();
await newSystem.start();

// Add health check
app.get('/health/a2a', createCombinedHealthCheck());
```

## Configuration

### A2ASystemConfig

```typescript
interface A2ASystemConfig {
  port?: number;           // Server port (default: 3001)
  host?: string;           // Server host (default: 'localhost')
  enableDiscovery?: boolean; // Enable agent discovery (default: true)
}
```

### AgentConfig

```typescript
interface AgentConfig {
  id: string;              // Unique agent identifier
  name: string;            // Human-readable agent name
  type: 'leader' | 'worker'; // Agent type
  capabilities: string[];   // Agent capabilities/skills
  endpoint?: string;       // Agent endpoint URL
  autoStart?: boolean;     // Auto-start on registration
}
```

## Development Guidelines

### Creating Custom Agents

1. Extend `WorkerAgent` base class
2. Implement `initializeSkills()` method
3. Register skills with proper metadata
4. Handle skill execution with proper error handling
5. Create factory function for agent instantiation

### Skill Implementation

```typescript
protected async initializeSkills(): Promise<void> {
  await this.registerSkill({
    id: 'my-skill',
    name: 'My Custom Skill',
    description: 'Description of what this skill does',
    inputModes: ['text/plain', 'application/json'],
    outputModes: ['application/json'],
    tags: ['category', 'subcategory'],
    execute: async (message: Message, context: SkillContext) => {
      // Skill implementation
      return {
        success: true,
        data: result,
        metadata: { executionTime: Date.now() }
      };
    }
  });
}
```

## Error Handling

The system includes comprehensive error handling:

- Agent startup/shutdown errors
- Skill execution failures
- Network communication errors
- Discovery service failures
- Task delegation timeouts

## Monitoring and Logging

- Winston logger integration
- Agent lifecycle events
- Task execution metrics
- Performance monitoring
- Health check endpoints

## Future Enhancements

- [ ] Distributed agent deployment
- [ ] Advanced load balancing algorithms
- [ ] Agent capability learning
- [ ] Workflow orchestration
- [ ] Performance analytics dashboard
- [ ] Agent marketplace integration

## Dependencies

The A2A system relies on:

- `@a2a-js/sdk` - Core A2A protocol implementation
- `winston` - Logging framework
- `express` - Web framework integration
- `uuid` - Unique identifier generation
- `zod` - Runtime type validation

## Testing

Test files should be created in the `__tests__` directory with comprehensive coverage of:

- Agent registration and lifecycle
- Skill execution and error handling
- Task delegation workflows
- Discovery service functionality
- Integration scenarios

---

*This implementation provides a robust foundation for agent-to-agent communication and can be extended to support more complex multi-agent workflows and distributed computing scenarios.*