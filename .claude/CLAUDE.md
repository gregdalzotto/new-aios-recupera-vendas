# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# Synkra AIOS Development Rules for Claude Code

You are working with Synkra AIOS, an AI-Orchestrated System for Full Stack Development.

## Core Framework Understanding

Synkra AIOS is a meta-framework that orchestrates AI agents to handle complex development workflows. Always recognize and work within this architecture. **This is not a generic codebase—it is an agent framework with explicit, predetermined workflows.**

### The 4-Layer Architecture

```
infrastructure/ (base utilities, no dependencies)
    ↓
core/ (config, session, elicitation, orchestration)
    ↓
development/ (agent definitions, tasks, workflows)
    ↓
product/ (static templates and checklists)
```

**Critical Rule**: Code can only reference DOWNWARD in this hierarchy. Infrastructure has no dependencies; Development depends on Core/Infrastructure.

## Agent System

### Agent Activation
- Agents are activated with @agent-name syntax: @dev, @qa, @architect, @pm, @po, @sm, @analyst, @devops, @data-engineer, @ux-design-expert, @aios-master
- Agent definitions are YAML-based Markdown files in `.aios-core/development/agents/{agent-id}.md`
- Agent commands use the * prefix: *help, *create-story, *task, *develop, *exit
- When an agent is activated, **load the entire agent definition file and parse its YAML config block**—do not skip to task execution

### Agent Context
When an agent is active:
- Load the agent's YAML configuration (persona, commands, dependencies, title, icon)
- Use the `greeting-builder.js` script to generate context-aware greetings
- Follow that agent's specific persona and expertise
- Use the agent's designated workflow patterns
- Execute only tasks explicitly listed in the agent's dependencies
- Maintain the agent's perspective throughout the interaction

## Development Methodology

### Story-Driven Development
1. **Work from stories** - All development starts with a story in `docs/stories/`
2. **Update progress** - Mark checkboxes as tasks complete: [ ] → [x]
3. **Track changes** - Maintain the File List section in the story
4. **Follow criteria** - Implement exactly what the acceptance criteria specify

### Code Standards
- Write clean, self-documenting code
- Follow existing patterns in the codebase
- Include comprehensive error handling
- Add unit tests for all new functionality
- Use TypeScript/JavaScript best practices

### Testing Requirements
- Run all tests before marking tasks complete
- Ensure linting passes: `npm run lint`
- Verify type checking: `npm run typecheck`
- Add tests for new features
- Test edge cases and error scenarios

## AIOS Framework Structure

The framework is organized into 4 layers with strict dependency rules:

```
.aios-core/
├── infrastructure/     # Base layer (50+ utilities, no dependencies)
│   ├── scripts/        # Git, PM adapters, template engine, validation, analysis
│   ├── templates/      # Code/document templates
│   ├── tools/          # Build, CLI, testing tools
│   └── schemas/        # Validation schemas
│
├── core/               # Runtime foundation (depends on infrastructure)
│   ├── config/         # ConfigCache, configuration lazy-loading
│   ├── session/        # Context detection, session management
│   ├── elicitation/    # Interactive prompting engine
│   ├── orchestration/  # Master orchestrator, workflow execution, recovery
│   ├── registry/       # Service discovery and registration
│   ├── health-check/   # Component health validation
│   └── events/         # Event system
│
├── development/        # Agent assets (depends on core + infrastructure)
│   ├── agents/         # 11 agent definitions (YAML/Markdown)
│   │   ├── dev.md      # Dex (Builder)
│   │   ├── qa.md, architect.md, pm.md, po.md, sm.md
│   │   ├── analyst.md, devops.md, data-engineer.md, ux-design-expert.md
│   │   └── aios-master.md
│   ├── tasks/          # 115+ executable task workflows (Markdown + YAML)
│   ├── workflows/      # 13+ workflow definitions (YAML)
│   │   ├── greenfield-fullstack, greenfield-service, greenfield-ui
│   │   ├── brownfield-discovery, brownfield-fullstack, brownfield-service, brownfield-ui
│   │   ├── qa-loop, spec-pipeline, story-development-cycle
│   │   └── [specialized workflows]
│   ├── agent-teams/    # Pre-configured team compositions
│   ├── scripts/        # 24+ utilities: greeting-builder, story-manager, agent-config-loader
│   ├── templates/      # Specialized templates for agents
│   └── checklists/     # Quality gates and DoD validation
│
└── product/            # Static assets (templates, docs, reference data)
    ├── templates/      # 52+ document templates (story, PRD, epic, etc.)
    ├── checklists/     # Quality gates
    └── data/           # Reference knowledge for agents

docs/
├── stories/            # Development stories (numbered)
├── brief/              # Agent briefs (BRIEF_AGENTE_SARA.md, etc.)
├── architecture/       # System architecture documentation
└── [other docs]/
```

**Dependency Rule**: Code can only reference modules at same level or below. Infrastructure is isolated; Core builds on Infrastructure; Development builds on both; Product only loads templates.

## Core Modules Overview

### Infrastructure Layer (base utilities, no dependencies)
Provides 50+ reusable utilities organized by domain:
- **Git Integration**: GitWrapper, GitConfigDetector, BranchManager, CommitMessageGenerator
- **PM Adapters**: ClickUp, GitHub Projects, Jira, Local integrations
- **Template System**: TemplateEngine, ComponentGenerator
- **Validation**: AiosValidator, TemplateValidator, SpotCheckValidator
- **Analysis**: DependencyAnalyzer, SecurityChecker, CapabilityAnalyzer
- **Testing**: TestGenerator, CoverageAnalyzer, SandboxTester
- **Performance**: PerformanceAnalyzer, PerformanceOptimizer
- **Quality**: CodeQualityImprover, RefactoringSuggester

### Core Layer (runtime foundation)
- **ConfigCache**: Global singleton with TTL-based caching
- **ElicitationEngine**: Interactive prompting for agents/tasks/workflows
- **WorkflowOrchestrator**: Multi-step workflow execution with phase tracking
- **MasterOrchestrator**: Epic-level coordination with recovery strategies
- **ServiceRegistry**: Centralized service discovery
- **HealthCheck**: Component validation with severity levels

### Development Layer (agent assets)
**11 Agents** (each has YAML config + persona profile):
- `dev` (Dex) - Builder persona, code implementation
- `qa` (Quinn) - Quality assurance, test workflows
- `architect` - System design, architecture decisions
- `pm` (Pax) - Project management, planning
- `po` - Product owner, requirements, acceptance
- `sm` - Scrum master, ceremonies
- `analyst` (Aria) - Analysis, research, data
- `devops` (Gage) - DevOps, infrastructure, MCP management
- `data-engineer` - Data pipeline, analytics
- `ux-design-expert` - UX/UI design
- `aios-master` - Framework orchestration

**Tasks** (executable workflows with YAML frontmatter):
- Pre/post conditions (blocking validation gates)
- Execution modes: `yolo` (autonomous), `interactive` (user prompts), `pre-flight` (planning)
- Elicitation steps for interactive tasks
- Output validation and artifact generation

**Workflows** (linear sequences):
- Greenfield bootstrap (fullstack, service, UI)
- Brownfield discovery and development (fullstack, service, UI)
- Specialized: QA loop, spec pipeline, story development cycle

## Workflow & Task Execution

### Task Execution Pattern
1. Load complete task definition from `.aios-core/development/tasks/{task-name}.md`
2. Parse YAML frontmatter (execution mode, pre-conditions, elicitation)
3. Execute pre-conditions (blocking validation gates)
4. If `elicit: true`, run elicitation prompts via ElicitationEngine
5. Execute task steps sequentially
6. Validate post-conditions (quality gates)
7. Update story file with progress/decisions
8. Provide clear feedback on outcomes

### Interactive Workflows
- Workflows with `elicit: true` require user input via AskUserQuestion
- Workflows without elicitation are autonomous
- Present options clearly with descriptions
- Validate user responses against constraints
- Provide helpful defaults when appropriate
- Some workflows require pre-flight planning (exploration phase before execution)

## Agent Execution Flow

### When Agent is Activated (@dev, @qa, etc.)
1. **Load agent definition** from `.aios-core/development/agents/{agent-id}.md`
2. **Parse YAML config block** containing:
   - agent: name, id, title, icon
   - persona_profile: archetype, communication style, core principles
   - commands: list of available commands with visibility
   - dependencies: tasks and templates this agent can access
3. **Generate greeting** using `.aios-core/development/scripts/greeting-builder.js`
4. **Display agent status** and available commands
5. **Await user input** for next command

### When User Executes Agent Command (*command-name)
1. **Validate command** against agent's available commands
2. **Load referenced task** from `.aios-core/development/tasks/{task-name}.md`
3. **Execute task workflow** following the pattern above
4. **Maintain agent persona** throughout execution
5. **Return results to agent context** (don't break agent perspective)

### Task Dependencies Reference Pattern
Tasks reference dependencies as relative paths:
- Infrastructure utilities: `.aios-core/infrastructure/scripts/{utility-name}`
- Core services: `.aios-core/core/{module}`
- Templates: `.aios-core/product/templates/{template-name}` or agent-specific in development/templates

## Best Practices

### When implementing features:
- Check existing patterns first in the infrastructure/scripts or core modules
- Reuse components and utilities from lower layers (Infrastructure, Core)
- Follow naming conventions established in existing code
- Keep functions focused and testable
- Document complex logic, especially in orchestration layers
- Respect the 4-layer dependency hierarchy

### When working with agents:
- Respect agent boundaries—only load tasks that agent owns
- Use appropriate agent for each task (check agent definitions)
- Follow agent communication patterns and persona guidelines
- Maintain agent context throughout interaction (don't break persona)
- Load agent definitions fully before executing tasks
- Use greeting-builder for context-aware responses

### When handling errors:
```javascript
try {
  // Operation
} catch (error) {
  console.error(`Error in ${operation}:`, error);
  // Provide helpful error message
  throw new Error(`Failed to ${operation}: ${error.message}`);
}
```

### Critical Framework Rules:
- **No generic prompts**: Tasks are explicit workflows, not vague instructions
- **Elicitation matters**: Tasks with `elicit: true` MUST prompt users—never skip for "efficiency"
- **Task instructions override rules**: Explicit task YAML overrides general behavioral guidelines
- **Story-first development**: All work stems from stories in `docs/stories/` or `docs/brief/`
- **Config caching**: Use global ConfigCache with TTL for performance
- **Service discovery**: Use ServiceRegistry for component access
- **Recovery strategies**: Use RecoveryHandler for systematic failure management

## Git & GitHub Integration

### Commit Conventions
- Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, etc.
- Reference story ID: `feat: implement IDE detection [Story 2.1]`
- Keep commits atomic and focused

### GitHub CLI Usage
- Ensure authenticated: `gh auth status`
- Use for PR creation: `gh pr create`
- Check org access: `gh api user/memberships`

## AIOS-Specific Patterns & Implementations

### Agent Definition Structure (YAML Frontmatter)
```yaml
---
agent:
  name: "Agent Display Name"
  id: "agent-id"
  title: "Agent Title"
  icon: "emoji"
  version: "1.0.0"

persona_profile:
  archetype: "[Builder|Analyst|Validator|etc]"
  background: "[Agent background/expertise]"
  communication:
    tone: "[pragmatic|analytical|collaborative]"
    style: "[Direct instructions|Probing questions|etc]"

core_principles:
  - "CRITICAL RULE 1: How agent must behave"
  - "CRITICAL RULE 2: Constraints/boundaries"

commands:
  - name: "*command-name"
    description: "What it does"
    requires_input: true/false
    visible: true/false

dependencies:
  tasks:
    - "task-name-1.md"
    - "task-name-2.md"
  templates:
    - "template-name-1"
---
```

### Task Definition Structure (Markdown + YAML)
```yaml
---
task: functionName()
responsible: "agent-name"
execution_modes: ["yolo", "interactive", "pre-flight"]
pre-conditions:
  - blocking_gate: "Check X before proceeding"
post-conditions:
  - validation: "Verify Y was created"
inputs:
  - name: "param1"
    type: "string"
    required: true
outputs:
  - "generated-file.ts"
  - "test-file.spec.ts"
elicit: true/false  # Requires user interaction
---
```

### Workflow Definition Structure (YAML)
```yaml
---
workflow:
  id: "workflow-id"
  version: "1.0.0"
  phases:
    - phase_0: "Phase Name"
    - phase_1: "Next Phase"

  sequence:
    - id: "step-1"
      agent: "agent-id"
      task: "task-name.md"
      creates: ["output-file-1", "output-file-2"]
      optional: false
      notes: "Step execution guidance"
---
```

### Working with Configuration Cache
```javascript
const { globalConfigCache } = require('./.aios-core/core');

// Store with TTL (5 minutes = 300000ms)
globalConfigCache.set('cache-key', { data: value }, 300000);

// Retrieve
const cached = globalConfigCache.get('cache-key');

// Check if exists
if (globalConfigCache.has('cache-key')) {
  // Use cached value
}
```

### Using ElicitationEngine for Interactive Prompts
```javascript
const { ElicitationEngine } = require('./.aios-core/core');
const engine = new ElicitationEngine();

// Start interactive session
const session = await engine.startSession('create-agent');
const response = await engine.processStep(session.id, userInput);

// Available workflows: agentElicitationSteps, taskElicitationSteps, workflowElicitationSteps
```

### Service Registry Usage
```javascript
const { ServiceRegistry } = require('./.aios-core/core');
const registry = ServiceRegistry.getInstance();

// Register service
registry.register('service-name', serviceInstance);

// Get service
const service = registry.get('service-name');

// List available services
const services = registry.listServices();
```

### Workflow Orchestration
```javascript
const { WorkflowOrchestrator } = require('./.aios-core/core');
const orchestrator = new WorkflowOrchestrator();

// Load and execute workflow
const workflow = await orchestrator.loadWorkflow('workflow-id');
const result = await orchestrator.executeWorkflow(workflow, context);
```

### Story Updates (from tasks)
```javascript
// Update story progress
const story = await loadStory(storyId);
story.updateTask(taskId, { status: 'completed' });
story.updateCheckbox(lineNumber, true);  // Mark [ ] as [x]
await story.save();
```

### Agent Command Handling
```javascript
if (command.startsWith('*')) {
  const agentCommand = command.substring(1);
  await executeAgentCommand(agentCommand, args);
}
```

### Working with Templates
```javascript
const { TemplateEngine } = require('./.aios-core/infrastructure/scripts');
const engine = new TemplateEngine();

const template = await engine.loadTemplate('template-name');
const rendered = await engine.renderTemplate(template, context);
```

## Key Files & Navigation

### Agent Definitions (Start Here When Activating Agents)
```
.aios-core/development/agents/
├── dev.md              # Dex (Builder) - Main development agent
├── qa.md               # Quinn (QA) - Test & quality workflows
├── architect.md        # System design & architecture
├── pm.md               # Pax (Project Manager) - Planning & coordination
├── po.md               # Product Owner - Requirements & acceptance
├── sm.md               # Scrum Master - Ceremonies & coordination
├── analyst.md          # Aria (Analyst) - Analysis & research
├── devops.md           # Gage (DevOps) - Infrastructure & MCP management
├── data-engineer.md    # Data pipelines & analytics
├── ux-design-expert.md # UX/UI design workflows
└── aios-master.md      # Framework orchestration
```
Each agent file contains YAML config + persona profile → load fully before executing tasks.

### Core Modules (Foundation, Used by Tasks)
```
.aios-core/core/
├── config/             # ConfigCache, configuration management
├── session/            # Context detection, session loading
├── elicitation/        # Interactive prompting engine
├── orchestration/      # Master/workflow orchestrators, recovery
├── registry/           # Service discovery
├── health-check/       # Component validation
└── events/             # Event system
```

### Infrastructure Utilities (Lower-level Functions)
```
.aios-core/infrastructure/
├── scripts/            # Git, PM adapters, templates, validation, analysis
├── templates/          # Code/document templates
├── tools/              # Build, CLI tools
└── schemas/            # Validation schemas
```

### Tasks Library (Executable Workflows)
```
.aios-core/development/tasks/
├── story-*.md          # Story-related tasks
├── code-*.md           # Code operation tasks
├── document-*.md       # Documentation tasks
├── brownfield-*.md     # Brownfield project workflows
├── greenfield-*.md     # Greenfield project workflows
└── [115+ task files]   # All task definitions
```

### Workflows (Multi-Step Orchestration)
```
.aios-core/development/workflows/
├── greenfield-fullstack.yaml
├── greenfield-service.yaml
├── greenfield-ui.yaml
├── brownfield-discovery.yaml
├── brownfield-fullstack.yaml
├── brownfield-service.yaml
├── brownfield-ui.yaml
├── qa-loop.yaml
├── spec-pipeline.yaml
└── story-development-cycle.yaml
```

### Stories & Documentation
```
docs/
├── stories/            # Development stories (numbered)
├── brief/              # Agent briefs (BRIEF_AGENTE_SARA.md, etc.)
└── [other docs]/       # Architecture, guides, references
```

## Environment Setup

### Required Tools
- Node.js 18+
- GitHub CLI
- Git
- Your preferred package manager (npm/yarn/pnpm)

### Configuration Files
- `.aios-core/.aios-core/core-config.yaml` - Framework configuration
- `.env` - Environment variables
- `.claude/rules/mcp-usage.md` - MCP management rules (DevOps only)

## Common Commands

### AIOS Commands (Agent-Based)
Commands are agent-specific via * prefix. Common commands across agents:
- `*help` - Show available commands for current agent
- `*exit` - Exit current agent, return to main
- `*status` - Show current project/task status

### AIOS Master Commands (@aios-master)
- `*create-story` - Create new development story
- `*task {name}` - Execute specific task by name
- `*workflow {name}` - Run workflow by name
- `*list-agents` - Show available agents
- `*list-tasks` - Show available tasks
- `*list-workflows` - Show available workflows

### Development Commands (npm)
From `.aios-core/` directory:
- `npm run build` - Build core module (runs `node ../tools/build-core.js`)
- `npm test` - Run all tests (unit + integration)
- `npm run test:unit` - Run unit tests via Jest
- `npm run test:integration` - Run integration tests via Jest
- `npm run lint` - ESLint code style check
- `npm run typecheck` - TypeScript type checking

### Project Build & Test (Root)
Check root package.json for project-specific scripts. Common patterns:
- `npm run dev` - Start development server
- `npm test` - Run project tests
- `npm run lint` - Check project code style
- `npm run build` - Build project for production

## Debugging & Troubleshooting

### Enable Debug Mode
```bash
export AIOS_DEBUG=true
```

### Core Module Testing
From `.aios-core/` directory:
```bash
npm test                    # Run all tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run lint               # Check code style
npm run typecheck          # Type checking
npm run build              # Build core module
```

### Regression Tests
Core module includes 7 regression tests (CORE-01 to CORE-07):
- CORE-01: Config Loading
- CORE-02: Config Caching
- CORE-03: Session Management
- CORE-04: Elicitation Engine
- CORE-05: YAML Validation
- CORE-06: Output Formatting
- CORE-07: Package Exports

### Common Issues & Solutions

#### Task Won't Execute
1. Verify agent has task in its `dependencies.tasks` list
2. Check task YAML frontmatter syntax (pre-conditions, elicitation)
3. Verify file path in agent definition is correct
4. Run `npm run lint` in .aios-core to check for errors

#### Workflow Fails Mid-Execution
1. Check RecoveryHandler is configured in WorkflowOrchestrator
2. Verify pre-conditions for failing step (blocking gates)
3. Review WorkflowOrchestrator logs for phase transitions
4. Check dependencies between steps are satisfied

#### Config Not Caching Properly
1. Verify TTL is set correctly (milliseconds)
2. Check ConfigCache is using global singleton
3. Ensure no cache clears between reads
4. Monitor cache performance: `getConfigPerformanceMetrics()`

#### Elicitation Prompts Not Working
1. Verify task has `elicit: true` in YAML
2. Check ElicitationEngine session is created before processing
3. Ensure user input validation matches constraints
4. Review elicitation steps (agentElicitationSteps, taskElicitationSteps, workflowElicitationSteps)

### Trace Execution Flow
To understand how modules interact:
1. Start with agent definition (agent.md)
2. Trace task dependencies listed in agent
3. Follow task YAML to understand execution mode
4. Check infrastructure scripts called by task
5. Trace core modules used (ConfigCache, ElicitationEngine, etc.)

### Log Important State
Use decision-recorder.js to log decisions:
```javascript
const { DecisionRecorder } = require('./.aios-core/development/scripts');
const recorder = new DecisionRecorder();
recorder.log({
  decision: 'What was decided',
  reasoning: 'Why this choice',
  timestamp: new Date(),
  context: { /* relevant context */ }
});
```

## Claude Code Specific Configuration

### Performance Optimization
- Prefer batched tool calls when possible for better performance
- Use parallel execution for independent operations
- Cache frequently accessed data in memory during sessions

### Tool Usage Guidelines
- Always use the Grep tool for searching, never `grep` or `rg` in bash
- Use the Task tool for complex multi-step operations
- Batch file reads/writes when processing multiple files
- Prefer editing existing files over creating new ones

### Session Management
- Track story progress throughout the session
- Update checkboxes immediately after completing tasks
- Maintain context of the current story being worked on
- Save important state before long-running operations

### Error Recovery
- Always provide recovery suggestions for failures
- Include error context in messages to user
- Suggest rollback procedures when appropriate
- Document any manual fixes required

### Testing Strategy
- Run tests incrementally during development
- Always verify lint and typecheck before marking complete
- Test edge cases for each new feature
- Document test scenarios in story files

### Documentation
- Update relevant docs when changing functionality
- Include code examples in documentation
- Keep README synchronized with actual behavior
- Document breaking changes prominently

## Investigating the Codebase

### Quick Navigation Strategy
When exploring the codebase:
1. **For agent questions**: Start in `.aios-core/development/agents/{agent-id}.md`
2. **For task questions**: Start in `.aios-core/development/tasks/{task-name}.md`
3. **For workflow questions**: Start in `.aios-core/development/workflows/{workflow-name}.yaml`
4. **For core functionality**: Check `.aios-core/core/{module}/` for implementation
5. **For utilities**: Check `.aios-core/infrastructure/scripts/{script-name}.js`

### File Search Patterns
Use Glob tool for common patterns:
```bash
# Find all agent definitions
.aios-core/development/agents/*.md

# Find all tasks
.aios-core/development/tasks/*.md

# Find all workflows
.aios-core/development/workflows/*.yaml

# Find infrastructure utilities
.aios-core/infrastructure/scripts/*.js

# Find test files
.aios-core/**/tests/**/*.test.js
```

### Understanding Module Exports
Check index files to understand public API:
- `.aios-core/core/index.js` - Core module exports
- `.aios-core/core/index.esm.js` - ES module exports
- `.aios-core/package.json` - Module metadata and exports field

### Key Architectural Points to Investigate
When understanding how things work:
1. **Agent activation**: Load agent definition → parse YAML → use greeting-builder
2. **Task execution**: Parse YAML → check pre-conditions → run elicitation → execute steps → validate post-conditions
3. **Workflow orchestration**: Load YAML → execute phases sequentially → invoke agents → handle recovery
4. **Configuration**: GlobalConfigCache with TTL → lazy-loading → section-based access
5. **Service discovery**: ServiceRegistry singleton → register/get patterns → lazy initialization

### Module Dependencies Reference
```
Product (static)
  └─ uses templates from Core/Infrastructure

Development (executable)
  └─ depends on Core + Infrastructure

Core (runtime)
  └─ depends on Infrastructure

Infrastructure (base)
  └─ no dependencies
```

## Claude Code Session Configuration

Claude Code can modify the following settings for the current session by editing this file:

### Working Directory & Context
- Current project working directory: `/Users/gregoridalzotto/Documents/Pessoais/Projetos/new-aios-recupera-vendas`
- Git repository: Not initialized in root (monorepo structure with .aios-core module)
- Active agent context: None (controlled by user activation)

### Session Preferences (Editable)
Users and Claude Code can customize for this session:
- **Preferred verbosity**: Default is concise (edit if verbose explanations needed)
- **Tool usage style**: Default prefers native tools over bash (edit if bash preferred)
- **Error handling**: Default includes recovery suggestions (edit if different approach needed)
- **Comment style**: Default is minimal (edit if more documentation needed)
- **Test coverage**: Default includes edge cases (edit if specific coverage needed)

### How to Modify Session Settings
1. Claude Code can directly edit sections in this CLAUDE.md under "Session Preferences"
2. Changes apply only to current session (don't affect future sessions)
3. Add custom preferences as needed: `- **Your Setting**: Description`
4. Use this pattern for toggles: `- **Feature Name**: [ENABLED/DISABLED]`

### Recommended Session Customizations
For complex development work:
- `- **Verbose Mode**: [DISABLED]` → Add to enable detailed explanations
- `- **Task Tracking**: [ENABLED]` → Use TaskCreate/TaskUpdate for progress
- `- **Decision Logging**: [ENABLED]` → Log decisions in memory files

For quick fixes:
- `- **Minimal Output**: [ENABLED]` → Very concise responses
- `- **Fast Iteration**: [ENABLED]` → Skip non-critical tests
- `- **No Extra Comments**: [ENABLED]` → Code only, no explanation

### Customizations Active This Session
- **Session Mode**: Standard (edit this line to change defaults)
- **Task Tracking**: Not enabled (set to [ENABLED] to use TaskCreate/TaskUpdate)

---

## Project-Specific Guidance

### When Working on AIOS Core Module
The `.aios-core/` package (`@aios-fullstack/core` v4.31.0) is the central runtime:
- Changes here affect ALL agents and workflows
- Run tests after any core changes: `npm test` from `.aios-core/`
- Keep strict dependency hierarchy (no circular references)
- Document new exports in core README.md

### When Adding New Agents
1. Create agent definition in `.aios-core/development/agents/{agent-id}.md`
2. Include complete YAML config (persona, commands, dependencies)
3. List all accessible tasks in `dependencies.tasks`
4. Document agent persona and communication style
5. Test agent activation and greeting generation
6. Add agent to `aios-master.md` dependencies if applicable

### When Adding New Tasks
1. Create task in `.aios-core/development/tasks/{task-name}.md`
2. Include YAML frontmatter (execution mode, pre/post conditions, elicitation)
3. Add task reference to appropriate agent's dependencies
4. Test with both `yolo` and `interactive` modes
5. Document elicitation steps if `elicit: true`
6. Update story files that might use this task

### When Adding New Workflows
1. Create workflow in `.aios-core/development/workflows/{workflow-name}.yaml`
2. Define phases and sequential steps
3. Each step must reference existing agent + task
4. Include proper error handling/recovery strategies
5. Test with sample project context
6. Document phase purposes and dependencies

### Code Quality Standards
- **Linting**: `npm run lint` must pass in .aios-core before any changes
- **Types**: `npm run typecheck` must pass (TypeScript validation)
- **Tests**: All tests must pass: `npm test`
- **Exports**: Update core/index.js if adding new public APIs
- **Backwards Compatibility**: Don't break existing module exports

### Git & Story Tracking
- Use conventional commits referencing story IDs: `feat: task name [Story X.Y]`
- Keep stories updated with progress checkboxes
- Log decisions using DecisionRecorder when available
- Link PRs to related stories in commit messages

### MCP Management Rules
**IMPORTANT**: Only @devops (Gage) agent manages MCP servers:
- Do NOT use MCP tools from other agents
- MCP configuration in `~/.docker/mcp/` (DevOps responsibility)
- Refer to `.claude/rules/mcp-usage.md` for detailed MCP patterns
- All MCP commands start with `*` prefix and execute via @devops

---
*Synkra AIOS Claude Code Configuration v2.0* 