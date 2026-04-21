# Lotte 技能开发文档

## 概述

Lotte 技能系统基于 **SKILL.md** 规范，每个技能由一个 Markdown 文件定义，包含元数据、指令内容和可选的引用资源。技能通过 `SkillManager` 管理，支持本地安装、市场安装和安全扫描。

***

## SKILL.md 规范

### 文件格式

SKILL.md 使用 YAML Front Matter + Markdown 正文格式：

```markdown
---
name: my-skill
version: 1.0.0
description: My custom skill description
author: developer-name
tags:
  - tag1
  - tag2
enabled: true
---

# My Skill Title

You are an expert in [domain]. When asked to [task]:

1. **Step 1** — Description of step 1
2. **Step 2** — Description of step 2
3. **Step 3** — Description of step 3

## Capabilities

- Capability 1
- Capability 2

## Guidelines

- Guideline 1
- Guideline 2

## Examples

### Example 1

Input: ...
Output: ...
```

### Front Matter 字段

| 字段            | 类型        | 必需 | 说明                   |
| ------------- | --------- | -- | -------------------- |
| `name`        | string    | 是  | 技能唯一标识，使用 kebab-case |
| `version`     | string    | 是  | 语义化版本号（如 `1.0.0`）    |
| `description` | string    | 是  | 技能简短描述               |
| `author`      | string    | 否  | 作者名称                 |
| `tags`        | string\[] | 否  | 标签列表，用于搜索和分类         |
| `enabled`     | boolean   | 否  | 是否启用，默认 `true`       |

### 正文规范

正文是技能的核心指令内容，遵循以下规范：

1. **以角色定义开头**：定义智能体在技能激活时的角色
2. **使用编号步骤**：清晰描述执行流程
3. **包含 Capabilities 段**：列出技能的能力范围
4. **包含 Guidelines 段**：列出约束和注意事项
5. **可选 Examples 段**：提供使用示例

***

## 技能目录结构

```
~/.lotte/data/skill_pool/
├── manifest.json                    # 技能池清单
├── my-skill/                        # 技能目录
│   ├── SKILL.md                     # 技能定义文件
│   ├── references/                  # 引用资源
│   │   ├── template.txt
│   │   └── config.json
│   └── scripts/                     # 脚本资源
│       └── helper.sh
└── another-skill/
    └── SKILL.md
```

### manifest.json

技能池清单文件，记录所有已安装技能的元数据：

```json
{
  "schema_version": "skill-manifest.v1",
  "version": 1,
  "skills": {
    "my-skill": {
      "name": "my-skill",
      "version": "1.0.0",
      "description": "My custom skill",
      "author": "developer",
      "tags": ["custom"],
      "enabled": true,
      "source": "local",
      "createdAt": 1713523200000,
      "updatedAt": 1713523200000,
      "content": "...",
      "references": {},
      "scripts": {},
      "signature": "sha256-hash"
    }
  }
}
```

***

## 创建自定义技能

### 步骤一：编写 SKILL.md

创建技能目录和 SKILL.md 文件：

```bash
mkdir -p ~/.lotte/data/skill_pool/my-translator
```

编写 `~/.lotte/data/skill_pool/my-translator/SKILL.md`：

```markdown
---
name: my-translator
version: 1.0.0
description: Professional translation between Chinese and English
author: developer
tags:
  - translation
  - chinese
  - english
enabled: true
---

# Professional Translator

You are a professional translator specializing in Chinese-English translation. When asked to translate:

1. **Identify the source language** — Determine if the input is Chinese or English
2. **Translate to the target language** — Provide accurate, natural-sounding translation
3. **Provide alternatives** — Offer 2-3 alternative translations when appropriate
4. **Explain nuances** — Note any cultural or contextual nuances

## Capabilities

- Chinese to English translation
- English to Chinese translation
- Technical document translation
- Idiom and expression localization

## Guidelines

- Preserve the original tone and style
- Use formal language for business content
- Use casual language for informal content
- Always provide the most natural-sounding translation
- Flag ambiguous terms and provide context-dependent translations
```

### 步骤二：添加引用资源（可选）

```bash
mkdir -p ~/.lotte/data/skill_pool/my-translator/references
```

创建术语表 `references/glossary.json`：

```json
{
  "terms": {
    "智能体": "Agent",
    "提示词": "Prompt",
    "微调": "Fine-tuning",
    "向量数据库": "Vector Database"
  }
}
```

### 步骤三：通过 API 安装

```bash
curl -X POST http://127.0.0.1:10623/api/v1/skills/install \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-translator",
    "version": "1.0.0",
    "description": "Professional translation between Chinese and English",
    "source": "local",
    "content": "---\nname: my-translator\nversion: 1.0.0\n---\n\n# Professional Translator\n..."
  }'
```

### 步骤四：验证安装

```bash
# 列出所有技能
curl http://127.0.0.1:10623/api/v1/skills

# 查看特定技能
curl http://127.0.0.1:10623/api/v1/skills/my-translator
```

***

## 技能管理 API

| 操作    | 方法     | 路径                             | 说明         |
| ----- | ------ | ------------------------------ | ---------- |
| 列出技能  | GET    | `/api/v1/skills`               | 返回所有已安装技能  |
| 查看技能  | GET    | `/api/v1/skills/:name`         | 返回指定技能详情   |
| 安装技能  | POST   | `/api/v1/skills/install`       | 安装本地或市场技能  |
| 从市场安装 | POST   | `/api/v1/skills/install/hub`   | 从 Hub 安装技能 |
| 搜索市场  | GET    | `/api/v1/skills/search?q=xxx`  | 搜索市场技能     |
| 启用技能  | POST   | `/api/v1/skills/:name/enable`  | 启用指定技能     |
| 禁用技能  | POST   | `/api/v1/skills/:name/disable` | 禁用指定技能     |
| 删除技能  | DELETE | `/api/v1/skills/:name`         | 删除指定技能     |
| 扫描技能  | POST   | `/api/v1/skills/:name/scan`    | 安全扫描技能     |

***

## 安全扫描

Lotte 内置技能安全扫描器，在安装和运行前检测潜在风险。

### 扫描规则

| 规则 ID                 | 严重级别     | 说明                                 |
| --------------------- | -------- | ---------------------------------- |
| `dangerous-exec`      | Critical | 危险代码执行模式（eval、exec、child\_process） |
| `shell-injection`     | High     | Shell 注入模式                         |
| `network-exfil`       | High     | 网络数据外泄模式                           |
| `file-read-sensitive` | High     | 读取敏感系统文件                           |
| `env-leak`            | Medium   | 环境变量访问                             |
| `crypto-mine`         | Critical | 加密货币挖矿模式                           |
| `obfuscated-code`     | High     | 混淆代码检测                             |
| `path-traversal`      | High     | 路径遍历模式                             |

### 严重级别

| 级别         | 说明   | 处理建议 |
| ---------- | ---- | ---- |
| `info`     | 信息提示 | 无需处理 |
| `low`      | 低风险  | 建议关注 |
| `medium`   | 中等风险 | 建议修复 |
| `high`     | 高风险  | 必须修复 |
| `critical` | 严重风险 | 禁止安装 |

### 扫描结果

```json
{
  "ok": true,
  "data": {
    "skillName": "my-skill",
    "isSafe": true,
    "maxSeverity": "info",
    "findings": [
      {
        "id": "env-leak",
        "severity": "info",
        "rule": "env-leak",
        "message": "Environment variable access detected",
        "file": "scripts/setup.sh",
        "line": 5
      }
    ],
    "scanDurationSeconds": 0.234,
    "analyzersUsed": ["pattern"]
  }
}
```

***

## 技能市场（Hub）

### 搜索技能

```bash
curl "http://127.0.0.1:10623/api/v1/skills/search?q=translation&limit=10"
```

### 从市场安装

```bash
curl -X POST http://127.0.0.1:10623/api/v1/skills/install/hub \
  -H "Content-Type: application/json" \
  -d '{"slug": "professional-translator"}'
```

### Hub 配置

在 `skills.json` 中配置 Hub 地址：

```json
{
  "hub": {
    "baseUrl": "https://clawhub.ai",
    "timeout": 15000,
    "retries": 3
  }
}
```

***

## 内置技能

Lotte 预装以下内置技能：

| 技能名           | 说明             |
| ------------- | -------------- |
| `file-reader` | 读取和分析文件内容      |
| `code-review` | 代码质量、安全和最佳实践审查 |

内置技能的 `source` 为 `builtin`，不可删除但可禁用。

***

## 完整示例：API 文档生成技能

```markdown
---
name: api-doc-generator
version: 1.0.0
description: Generate API documentation from route definitions
author: lotte-community
tags:
  - api
  - documentation
  - generator
enabled: true
---

# API Documentation Generator

You are an API documentation expert. When asked to generate API documentation:

1. **Analyze the route definitions** — Read and understand all route files
2. **Extract endpoint information** — Identify HTTP methods, paths, parameters, and responses
3. **Generate structured documentation** — Create well-formatted API documentation
4. **Include examples** — Add request/response examples for each endpoint
5. **Document error codes** — List all possible error responses

## Capabilities

- Generate REST API documentation from source code
- Extract parameter schemas and validation rules
- Create request/response examples
- Document authentication requirements
- Generate error code reference tables

## Guidelines

- Use consistent formatting across all endpoints
- Include all required and optional parameters
- Provide realistic example values
- Document all possible error responses
- Group related endpoints together
- Use tables for parameter descriptions
- Include curl examples for quick testing

## Output Format

For each endpoint, include:

- HTTP method and path
- Description
- Authentication requirement
- Request parameters (with type, required, description)
- Request body schema (if applicable)
- Success response format
- Error response format
- Example curl command
```

***

## 最佳实践

### 1. 技能命名

- 使用 kebab-case：`code-review`、`api-doc-generator`
- 避免过于通用的名称：`helper`、`tool`
- 体现技能的专业领域：`sql-optimizer`、`react-component-builder`

### 2. 描述编写

- 简洁明了，一句话说明技能用途
- 包含关键词，便于搜索
- 避免冗长描述

### 3. 指令设计

- 以角色定义开头，设定智能体的专业身份
- 使用编号步骤，确保执行流程清晰
- 包含约束条件，防止越界行为
- 提供示例，帮助智能体理解预期输出

### 4. 引用资源

- 将模板、配置等外部资源放在 `references/` 目录
- 脚本文件放在 `scripts/` 目录
- 避免在 SKILL.md 中内嵌大段代码

### 5. 版本管理

- 遵循语义化版本号：`MAJOR.MINOR.PATCH`
- 破坏性变更升级 MAJOR
- 新功能升级 MINOR
- 修复升级 PATCH

### 6. 安全合规

- 不包含恶意代码
- 不访问敏感系统文件
- 不泄露环境变量
- 不执行危险操作
- 安装前通过安全扫描

