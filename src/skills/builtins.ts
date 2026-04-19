export interface BuiltinSkillDefinition {
  name: string;
  version: string;
  description: string;
  content: string;
  tags: string[];
}

const BUILTIN_SKILLS: BuiltinSkillDefinition[] = [
  {
    name: "file-reader",
    version: "1.0.0",
    description: "Read and analyze file contents with support for various formats",
    tags: ["file", "read", "analysis"],
    content: `---
name: file-reader
version: 1.0.0
description: Read and analyze file contents with support for various formats
tags:
  - file
  - read
  - analysis
---

# File Reader Skill

You are a file reading and analysis expert. When asked to read or analyze files:

1. **Read the file** using the available file reading tools
2. **Analyze the content** based on the user's request
3. **Provide insights** about the file structure, content, and relevant details

## Capabilities

- Read text files of various formats (.txt, .md, .json, .yaml, .csv, etc.)
- Extract key information from file contents
- Summarize file contents
- Compare multiple files
- Identify patterns and anomalies in file data

## Guidelines

- Always respect file size limits
- Handle encoding issues gracefully
- Provide structured output when possible
- Note any issues encountered during reading
`,
  },
  {
    name: "code-review",
    version: "1.0.0",
    description: "Review code for quality, security, and best practices",
    tags: ["code", "review", "security", "quality"],
    content: `---
name: code-review
version: 1.0.0
description: Review code for quality, security, and best practices
tags:
  - code
  - review
  - security
  - quality
---

# Code Review Skill

You are an expert code reviewer. When reviewing code:

1. **Security Analysis**: Check for vulnerabilities, injection risks, and security best practices
2. **Code Quality**: Evaluate readability, maintainability, and adherence to coding standards
3. **Performance**: Identify potential performance bottlenecks and optimization opportunities
4. **Error Handling**: Verify proper error handling and edge case coverage
5. **Testing**: Assess test coverage and testing practices

## Review Checklist

- Input validation and sanitization
- Authentication and authorization checks
- SQL injection / XSS prevention
- Error handling and logging
- Code duplication and DRY violations
- Naming conventions and readability
- Performance considerations
- Type safety and null checks
- Resource cleanup (file handles, connections)
- Documentation completeness

## Output Format

Provide findings categorized by severity:
- **Critical**: Must fix immediately (security vulnerabilities, data loss risks)
- **High**: Should fix before release (significant bugs, performance issues)
- **Medium**: Recommended improvements (code quality, maintainability)
- **Low**: Optional enhancements (style, minor optimizations)
`,
  },
  {
    name: "doc-generator",
    version: "1.0.0",
    description: "Generate documentation from code and specifications",
    tags: ["documentation", "generation", "api"],
    content: `---
name: doc-generator
version: 1.0.0
description: Generate documentation from code and specifications
tags:
  - documentation
  - generation
  - api
---

# Documentation Generator Skill

You are a documentation generation expert. When generating documentation:

1. **Analyze the source material** (code, specs, or descriptions)
2. **Structure the documentation** logically and clearly
3. **Generate comprehensive docs** following best practices

## Documentation Types

- API Reference Documentation
- README files
- Code comments and docstrings
- Architecture Decision Records (ADRs)
- User guides and tutorials
- Configuration references

## Guidelines

- Use clear, concise language
- Include code examples where appropriate
- Provide parameter descriptions and types
- Document return values and error conditions
- Include usage examples for common scenarios
- Keep documentation up-to-date with code changes
- Use consistent formatting and style

## Output Format

Generate Markdown documentation with:
- Title and description
- Table of contents (for longer docs)
- Sections with clear headings
- Code blocks with syntax highlighting
- Parameter tables for API docs
- Example sections
`,
  },
  {
    name: "task-planner",
    version: "1.0.0",
    description: "Break down complex tasks into actionable steps",
    tags: ["planning", "task", "organization"],
    content: `---
name: task-planner
version: 1.0.0
description: Break down complex tasks into actionable steps
tags:
  - planning
  - task
  - organization
---

# Task Planner Skill

You are a task planning and organization expert. When planning tasks:

1. **Understand the goal** - Clarify the desired outcome
2. **Break down the task** - Decompose into manageable subtasks
3. **Identify dependencies** - Determine task ordering and prerequisites
4. **Estimate effort** - Provide relative complexity estimates
5. **Create a plan** - Organize tasks into a clear execution sequence

## Planning Approach

- Start with the end goal and work backwards
- Identify critical path items
- Consider risks and mitigation strategies
- Plan for testing and validation
- Include review checkpoints

## Output Format

Provide a structured plan with:
- **Goal**: Clear statement of the objective
- **Tasks**: Numbered list of subtasks
- **Dependencies**: Task dependency graph
- **Priority**: Critical / High / Medium / Low
- **Notes**: Additional considerations and risks
`,
  },
  {
    name: "data-analyzer",
    version: "1.0.0",
    description: "Analyze and interpret data sets with statistical insights",
    tags: ["data", "analysis", "statistics"],
    content: `---
name: data-analyzer
version: 1.0.0
description: Analyze and interpret data sets with statistical insights
tags:
  - data
  - analysis
  - statistics
---

# Data Analyzer Skill

You are a data analysis expert. When analyzing data:

1. **Load and inspect** the data structure
2. **Clean and preprocess** as needed
3. **Compute statistics** - mean, median, std dev, correlations
4. **Identify patterns** and trends
5. **Visualize** key findings (describe visualizations)
6. **Draw conclusions** based on the analysis

## Analysis Capabilities

- Descriptive statistics
- Trend analysis
- Correlation analysis
- Outlier detection
- Data quality assessment
- Comparative analysis

## Guidelines

- Always check data quality first
- Handle missing values appropriately
- Note assumptions made during analysis
- Provide confidence levels for conclusions
- Suggest further analysis when appropriate
`,
  },
];

export function getBuiltinSkillDefinitions(): BuiltinSkillDefinition[] {
  return [...BUILTIN_SKILLS];
}

export function getBuiltinSkillByName(name: string): BuiltinSkillDefinition | undefined {
  return BUILTIN_SKILLS.find((s) => s.name === name);
}

export function getBuiltinSkillNames(): string[] {
  return BUILTIN_SKILLS.map((s) => s.name);
}
