export interface BuiltinSkillDefinition {
  name: string;
  version: string;
  description: string;
  content: string;
  tags: string[];
  executable?: BuiltinSkillExecutable;
}

export interface BuiltinSkillExecutable {
  type: "shell" | "node" | "python";
  entry: string;
  args?: string[];
  env?: Record<string, string>;
}

const BUILTIN_SKILLS: BuiltinSkillDefinition[] = [
  {
    name: "file-reader",
    version: "2.0.0",
    description: "Read and analyze file contents with support for various formats. Includes shell commands for type detection and large file handling.",
    tags: ["file", "read", "analysis", "shell"],
    content: `---
name: file-reader
version: 2.0.0
description: Read and analyze file contents with support for various formats
tags:
  - file
  - read
  - analysis
  - shell
---

# File Reader Skill

You are a file reading and analysis expert. When asked to read or analyze files:

## Quick Type Check

Before reading a file, probe its type:

\`\`\`bash
file -b --mime-type "/path/to/file"
\`\`\`

## Text-Based Files

Preferred for: \`.txt\`, \`.md\`, \`.json\`, \`.yaml/.yml\`, \`.csv/.tsv\`, \`.log\`, \`.sql\`, \`.ini\`, \`.toml\`, \`.py\`, \`.js\`, \`.html\`, \`.xml\` source code.

Steps:
1. Use \`read_file\` to fetch content
2. Summarize key sections or show the relevant slice
3. For JSON/YAML, list top-level keys and important fields
4. For CSV/TSV, show header + first few rows, then summarize columns

## Large Files

If the file is large, use a tail window:

\`\`\`bash
tail -n 200 "/path/to/file.log"
\`\`\`

Or extract a specific range:

\`\`\`bash
sed -n '100,200p' "/path/to/file"
\`\`\`

## Binary File Inspection

For binary files, use:

\`\`\`bash
xxd "/path/to/file" | head -n 50
\`\`\`

## Directory Listing

\`\`\`bash
ls -la "/path/to/directory"
\`\`\`

## Capabilities

- Read text files of various formats
- Extract key information from file contents
- Summarize file contents
- Compare multiple files
- Identify patterns and anomalies in file data
- Handle large files with tail/head/sed
- Detect file types with \`file\` command

## Guidelines

- Always respect file size limits
- Handle encoding issues gracefully
- Provide structured output when possible
- Note any issues encountered during reading
- Never execute untrusted files
- Prefer reading the smallest portion necessary
`,
    executable: {
      type: "shell",
      entry: "file",
      args: ["-b", "--mime-type"],
    },
  },
  {
    name: "code-review",
    version: "2.0.0",
    description: "Review code for quality, security, and best practices. Includes shell commands for static analysis and linting.",
    tags: ["code", "review", "security", "quality", "shell"],
    content: `---
name: code-review
version: 2.0.0
description: Review code for quality, security, and best practices
tags:
  - code
  - review
  - security
  - quality
  - shell
---

# Code Review Skill

You are an expert code reviewer. When reviewing code:

## Quick Analysis Commands

### Line count and complexity
\`\`\`bash
wc -l "/path/to/file"
find "/path/to/project" -name "*.ts" | xargs wc -l | tail -n 1
\`\`\`

### Search for patterns
\`\`\`bash
grep -rn "TODO\\|FIXME\\|HACK\\|XXX" "/path/to/project" --include="*.ts"
grep -rn "console\\.log\\|debugger" "/path/to/project" --include="*.ts"
\`\`\`

### Security scan
\`\`\`bash
grep -rn "eval(\\|exec(\\|child_process" "/path/to/project" --include="*.ts"
grep -rn "process\\.env" "/path/to/project" --include="*.ts"
\`\`\`

### Git diff review
\`\`\`bash
git diff HEAD~1 --stat
git diff HEAD~1 -- "*.ts"
\`\`\`

## Review Checklist

1. **Security Analysis**: Check for vulnerabilities, injection risks, and security best practices
2. **Code Quality**: Evaluate readability, maintainability, and adherence to coding standards
3. **Performance**: Identify potential performance bottlenecks and optimization opportunities
4. **Error Handling**: Verify proper error handling and edge case coverage
5. **Testing**: Assess test coverage and testing practices

### Detailed Checklist

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
    executable: {
      type: "shell",
      entry: "grep",
      args: ["-rn"],
    },
  },
  {
    name: "doc-generator",
    version: "2.0.0",
    description: "Generate documentation from code and specifications. Includes shell commands for extracting code structure.",
    tags: ["documentation", "generation", "api", "shell"],
    content: `---
name: doc-generator
version: 2.0.0
description: Generate documentation from code and specifications
tags:
  - documentation
  - generation
  - api
  - shell
---

# Documentation Generator Skill

You are a documentation generation expert. When generating documentation:

## Extract Code Structure

### TypeScript/JavaScript
\`\`\`bash
grep -rn "export\\s\\(function\\|class\\|interface\\|type\\|const\\)" "/path/to/src" --include="*.ts" --include="*.tsx"
\`\`\`

### Python
\`\`\`bash
grep -rn "^\\(class\\|def\\) " "/path/to/src" --include="*.py"
\`\`\`

### API Routes
\`\`\`bash
grep -rn "app\\.\\(get\\|post\\|put\\|delete\\|patch\\)" "/path/to/src" --include="*.ts"
\`\`\`

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
    executable: {
      type: "shell",
      entry: "grep",
      args: ["-rn", "export"],
    },
  },
  {
    name: "task-planner",
    version: "2.0.0",
    description: "Break down complex tasks into actionable steps with dependency analysis.",
    tags: ["planning", "task", "organization"],
    content: `---
name: task-planner
version: 2.0.0
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

## Project Structure Analysis

When planning for a codebase:

\`\`\`bash
find "/path/to/project" -type f -name "*.ts" | head -n 50
\`\`\`

\`\`\`bash
cat "/path/to/project/package.json"
\`\`\`

## Output Format

Provide a structured plan with:
- **Goal**: Clear statement of the objective
- **Tasks**: Numbered list of subtasks
- **Dependencies**: Task dependency graph
- **Priority**: Critical / High / Medium / Low
- **Notes**: Additional considerations and risks

## Example Output

### Goal
Implement user authentication system

### Tasks
1. [Critical] Design authentication data model
2. [Critical] Implement password hashing utilities
3. [High] Create registration endpoint
4. [High] Create login endpoint
5. [High] Implement JWT token generation
6. [Medium] Add authentication middleware
7. [Medium] Create password reset flow
8. [Low] Add rate limiting to auth endpoints

### Dependencies
- Task 3, 4 depend on Task 1, 2
- Task 6 depends on Task 5
- Task 7 depends on Task 5
- Task 8 depends on Task 3, 4
`,
  },
  {
    name: "data-analyzer",
    version: "2.0.0",
    description: "Analyze and interpret data sets with statistical insights. Includes shell commands for data inspection.",
    tags: ["data", "analysis", "statistics", "shell"],
    content: `---
name: data-analyzer
version: 2.0.0
description: Analyze and interpret data sets with statistical insights
tags:
  - data
  - analysis
  - statistics
  - shell
---

# Data Analyzer Skill

You are a data analysis expert. When analyzing data:

## Quick Data Inspection

### CSV/TSV files
\`\`\`bash
head -n 20 "/path/to/data.csv"
wc -l "/path/to/data.csv"
awk -F',' 'NR==1 {print NF " columns:"; for(i=1;i<=NF;i++) print "  " i ": " $i}' "/path/to/data.csv"
\`\`\`

### JSON files
\`\`\`bash
cat "/path/to/data.json" | python3 -c "import json,sys; d=json.load(sys.stdin); print(type(d).__name__); print(len(d) if isinstance(d,(list,dict)) else 'scalar')"
\`\`\`

### Log files
\`\`\`bash
grep -c "ERROR" "/path/to/file.log"
grep -c "WARN" "/path/to/file.log"
tail -n 100 "/path/to/file.log"
\`\`\`

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
    executable: {
      type: "shell",
      entry: "head",
      args: ["-n", "20"],
    },
  },
  {
    name: "shell-helper",
    version: "1.0.0",
    description: "Execute shell commands safely with proper error handling and output capture. Provides common shell operations for file system, process, and network tasks.",
    tags: ["shell", "system", "execution", "utility"],
    content: `---
name: shell-helper
version: 1.0.0
description: Execute shell commands safely with proper error handling
tags:
  - shell
  - system
  - execution
  - utility
---

# Shell Helper Skill

You are a shell command execution expert. Help users execute system commands safely.

## File System Operations

### Directory navigation
\`\`\`bash
pwd
ls -la
find . -name "*.ts" -type f
\`\`\`

### File operations
\`\`\`bash
cp source.txt dest.txt
mv old_name.txt new_name.txt
mkdir -p path/to/directory
\`\`\`

### Search and replace
\`\`\`bash
grep -rn "pattern" /path/to/search
sed -i 's/old/new/g' file.txt
\`\`\`

## Process Management

\`\`\`bash
ps aux | grep process_name
\`\`\`

## Network

\`\`\`bash
curl -s https://api.example.com/endpoint
\`\`\`

## Safety Rules

1. Never run destructive commands without confirmation (rm -rf, format, etc.)
2. Always preview changes before applying (use dry-run flags when available)
3. Validate user input before passing to shell commands
4. Use proper quoting to prevent injection
5. Check disk space before large operations
6. Log all executed commands for audit trail
`,
    executable: {
      type: "shell",
      entry: "bash",
      args: ["-c"],
    },
  },
  {
    name: "git-helper",
    version: "1.0.0",
    description: "Git version control operations including branch management, commit analysis, and repository inspection.",
    tags: ["git", "version-control", "scm", "shell"],
    content: `---
name: git-helper
version: 1.0.0
description: Git version control operations
tags:
  - git
  - version-control
  - scm
  - shell
---

# Git Helper Skill

You are a Git version control expert. Help users with Git operations.

## Repository Status

\`\`\`bash
git status
git log --oneline -n 20
git branch -a
\`\`\`

## Diff and Changes

\`\`\`bash
git diff
git diff --staged
git diff HEAD~1
\`\`\`

## Branch Management

\`\`\`bash
git checkout -b feature/new-feature
git merge main
git rebase main
\`\`\`

## Commit Analysis

\`\`\`bash
git log --oneline --graph --all -n 30
git blame file.ts
git show HEAD
\`\`\`

## Remote Operations

\`\`\`bash
git remote -v
git fetch --all
git pull origin main
\`\`\`

## Safety Rules

1. Never force push to shared branches without explicit confirmation
2. Always check for uncommitted changes before switching branches
3. Create backups before destructive operations
4. Verify remote URLs before pushing
`,
    executable: {
      type: "shell",
      entry: "git",
      args: ["status"],
    },
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

export function getExecutableSkills(): BuiltinSkillDefinition[] {
  return BUILTIN_SKILLS.filter((s) => s.executable !== undefined);
}

export function getSkillExecutable(name: string): BuiltinSkillExecutable | undefined {
  const skill = BUILTIN_SKILLS.find((s) => s.name === name);
  return skill?.executable;
}
