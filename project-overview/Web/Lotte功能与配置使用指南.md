# Lotte 智能体平台 - 功能与配置使用指南

## 一、项目概述

Lotte 是一个多渠道、通用智能体平台，具备自动化和编程开发能力。项目采用本地优先架构，支持多种 AI 模型、消息通道和工具扩展。

### 核心特性

| 特性    | 说明                                    |
| ----- | ------------------------------------- |
| 多渠道接入 | 微信（iLink Bot）、QQ（官方Bot API）、飞书（官方API） |
| 通用智能体 | 支持工具调用、任务编排、自主决策                      |
| 自动化能力 | 定时任务、工作流编排、事件触发                       |
| 编程开发  | 代码编写、代码分析、Git操作、DevOps流程              |
| 多模型支持 | OpenAI、Claude、Gemini、国产模型、自定义API      |
| Web网关 | React + Next.js 管理界面                  |
| 插件系统  | 完整的插件架构和SDK                           |
| MCP协议 | 支持 stdio/streamable\_http/sse 传输      |
| 技能系统  | SKILL.md 定义、内置技能、技能市场                 |
| 记忆系统  | 短期+长期记忆、向量搜索、自动压缩                     |
| 灵魂系统  | SOUL.md/PROFILE.md/AGENTS.md 定义人格     |
| RAG   | 文档上传、向量化存储、检索增强生成                     |
| 多模态   | 图片理解、视频理解、截图功能                        |
| 安全机制  | 操作审批、VM沙箱、审计日志                        |

***

## 二、配置文件详解

所有配置文件位于 `~/.lotte/config/` 目录（可通过环境变量 `LOTTE_STATE_DIR` 自定义）。

### 2.1 主配置文件 (lotte.json)

```json
{
  "app_name": "lotte",
  "version": "1.0.0",
  "data_dir": "",
  "log_level": "info",
  "language": "zh-CN",
  "modules": {
    "agent": true,
    "gateway": true,
    "channels": true,
    "tools": true,
    "skills": true,
    "mcp": true,
    "automation": true,
    "rag": true,
    "notification": true,
    "multimodal": true,
    "voice": true,
    "plugins": true
  }
}
```

| 字段          | 类型      | 默认值     | 说明                         |
| ----------- | ------- | ------- | -------------------------- |
| `app_name`  | string  | `lotte` | 应用名称                       |
| `version`   | string  | `1.0.0` | 版本号                        |
| `data_dir`  | string  | `""`    | 数据目录（空则使用默认）               |
| `log_level` | enum    | `info`  | 日志级别：debug/info/warn/error |
| `language`  | string  | `zh-CN` | 语言设置                       |
| `modules.*` | boolean | `true`  | 各功能模块开关                    |

### 2.2 AI 模型配置 (ai.json)

```json
{
  "default_provider": "openai",
  "default_model": "gpt-4o",
  "stt": {
    "provider_type": "disabled",
    "provider_id": "",
    "model": "whisper-1"
  },
  "providers": {
    "openai": {
      "api_url": "https://api.openai.com/v1",
      "api_key": "sk-xxx",
      "models": {
        "gpt-4o": {
          "context_window": 128000,
          "max_output": 16384
        }
      }
    },
    "anthropic": {
      "api_url": "https://api.anthropic.com",
      "api_key": "sk-ant-xxx",
      "models": {
        "claude-sonnet-4-20250514": {
          "context_window": 200000,
          "max_output": 8192
        }
      }
    },
    "custom": {
      "api_url": "http://localhost:8080/v1",
      "api_key": "your-key",
      "models": {}
    }
  },
  "model_aliases": {
    "gpt": "openai/gpt-4o",
    "claude": "anthropic/claude-sonnet-4-20250514"
  }
}
```

| 字段                                               | 类型     | 说明                                         |
| ------------------------------------------------ | ------ | ------------------------------------------ |
| `default_provider`                               | string | 默认 AI 提供商（openai/anthropic/custom）         |
| `default_model`                                  | string | 默认模型名称                                     |
| `stt.provider_type`                              | enum   | 语音转文字：disabled/local\_whisper/whisper\_api |
| `stt.model`                                      | string | STT 模型名称                                   |
| `providers.<name>.api_url`                       | string | API 地址                                     |
| `providers.<name>.api_key`                       | string | API 密钥                                     |
| `providers.<name>.models.<model>.context_window` | number | 上下文窗口大小                                    |
| `providers.<name>.models.<model>.max_output`     | number | 最大输出 Token                                 |
| `model_aliases`                                  | object | 模型别名映射（简化调用）                               |

### 2.3 网关配置 (gateway.json)

```json
{
  "host": "127.0.0.1",
  "port": 10623,
  "auth": {
    "mode": "none",
    "token": "",
    "password": ""
  },
  "websocket": {
    "max_connections": 10,
    "heartbeat_interval": 30000
  }
}
```

| 字段                             | 类型     | 默认值         | 说明                       |
| ------------------------------ | ------ | ----------- | ------------------------ |
| `host`                         | string | `127.0.0.1` | 网关监听地址（`0.0.0.0` 允许外部访问） |
| `port`                         | number | `10623`     | 网关监听端口                   |
| `auth.mode`                    | enum   | `none`      | 认证模式：none/token/password |
| `auth.token`                   | string | `""`        | Token 认证密钥               |
| `auth.password`                | string | `""`        | 密码认证                     |
| `websocket.max_connections`    | number | `10`        | 最大 WebSocket 连接数         |
| `websocket.heartbeat_interval` | number | `30000`     | 心跳间隔（毫秒）                 |

### 2.4 通道配置 (channels.json)

#### 微信通道

```json
{
  "weixin": {
    "enabled": false,
    "bot_token": "",
    "bot_token_file": "",
    "base_url": "",
    "bot_prefix": "",
    "media_dir": "",
    "dm_policy": "open",
    "group_policy": "open",
    "allow_from": [],
    "deny_message": ""
  }
}
```

| 字段               | 类型        | 说明                           |
| ---------------- | --------- | ---------------------------- |
| `enabled`        | boolean   | 是否启用                         |
| `bot_token`      | string    | Bot Token                    |
| `bot_token_file` | string    | Token 文件路径（优先使用）             |
| `base_url`       | string    | API 基础地址                     |
| `bot_prefix`     | string    | Bot 前缀（如 `/`）                |
| `media_dir`      | string    | 媒体文件目录                       |
| `dm_policy`      | enum      | 私聊策略：open/allowlist/denylist |
| `group_policy`   | enum      | 群聊策略：open/allowlist/denylist |
| `allow_from`     | string\[] | 白名单用户/群组                     |
| `deny_message`   | string    | 拒绝消息                         |

#### QQ 通道

```json
{
  "qq": {
    "enabled": false,
    "app_id": "",
    "client_secret": "",
    "bot_prefix": "",
    "markdown_enabled": true,
    "max_reconnect_attempts": 100
  }
}
```

| 字段                       | 类型      | 说明                   |
| ------------------------ | ------- | -------------------- |
| `app_id`                 | string  | QQ Bot App ID        |
| `client_secret`          | string  | QQ Bot Client Secret |
| `markdown_enabled`       | boolean | 是否启用 Markdown 渲染     |
| `max_reconnect_attempts` | number  | 最大重连次数               |

#### 飞书通道

```json
{
  "feishu": {
    "enabled": false,
    "app_id": "",
    "app_secret": "",
    "bot_prefix": "",
    "encrypt_key": "",
    "verification_token": "",
    "media_dir": "",
    "domain": "feishu",
    "dm_policy": "open",
    "group_policy": "open",
    "allow_from": [],
    "deny_message": "",
    "require_mention": false
  }
}
```

| 字段                   | 类型      | 说明                      |
| -------------------- | ------- | ----------------------- |
| `app_id`             | string  | 飞书 App ID               |
| `app_secret`         | string  | 飞书 App Secret           |
| `encrypt_key`        | string  | 加密密钥                    |
| `verification_token` | string  | 验证 Token                |
| `domain`             | enum    | 域名：feishu（国内）/ lark（海外） |
| `require_mention`    | boolean | 是否需要 @ 才响应              |

### 2.5 MCP 配置 (mcp.json)

```json
{
  "clients": {
    "my-server": {
      "name": "my-server",
      "description": "My MCP Server",
      "enabled": true,
      "transport": "stdio",
      "command": "npx",
      "args": ["my-mcp-server"],
      "env": {}
    },
    "remote-server": {
      "name": "remote-server",
      "description": "Remote MCP Server",
      "enabled": true,
      "transport": "streamable_http",
      "url": "http://localhost:3000/mcp",
      "headers": {}
    }
  }
}
```

| 字段            | 类型        | 说明                              |
| ------------- | --------- | ------------------------------- |
| `name`        | string    | 客户端名称（唯一标识）                     |
| `description` | string    | 描述信息                            |
| `enabled`     | boolean   | 是否启用                            |
| `transport`   | enum      | 传输方式：stdio/streamable\_http/sse |
| `command`     | string    | stdio 传输的启动命令                   |
| `args`        | string\[] | 命令参数                            |
| `url`         | string    | HTTP/SSE 传输的服务地址                |
| `headers`     | object    | HTTP 请求头                        |
| `env`         | object    | 环境变量                            |
| `cwd`         | string    | 工作目录                            |

### 2.6 工具配置 (tools.json)

```json
{
  "bash": {
    "enabled": true,
    "require_approval": true,
    "timeout": 30000
  },
  "file": {
    "enabled": true,
    "require_approval": false,
    "allowed_paths": []
  },
  "browser": {
    "enabled": true,
    "require_approval": true,
    "headless": true
  },
  "network": {
    "enabled": true,
    "require_approval": false,
    "allowed_domains": []
  },
  "git": {
    "enabled": true,
    "require_approval": true
  },
  "sandbox": {
    "enabled": true,
    "timeout": 60000,
    "max_memory": 256
  }
}
```

| 工具          | 字段                | 说明               |
| ----------- | ----------------- | ---------------- |
| **bash**    | `timeout`         | Shell 命令超时时间（毫秒） |
| **file**    | `allowed_paths`   | 允许访问的路径列表        |
| **browser** | `headless`        | 是否无头模式运行浏览器      |
| **network** | `allowed_domains` | 允许访问的域名列表        |
| **sandbox** | `max_memory`      | 沙箱最大内存（MB）       |

### 2.7 自动化配置 (automation.json)

```json
{
  "cron": {
    "enabled": true,
    "jobs": []
  },
  "workflow": {
    "enabled": true,
    "workflows": []
  },
  "trigger": {
    "enabled": true,
    "rules": []
  }
}
```

| 模块         | 说明     |
| ---------- | ------ |
| `cron`     | 定时任务调度 |
| `workflow` | 工作流编排  |
| `trigger`  | 事件触发规则 |

### 2.8 通知配置 (notification.json)

```json
{
  "message": {
    "enabled": true,
    "channels": []
  },
  "webhook": {
    "enabled": false,
    "url": "",
    "headers": {}
  },
  "email": {
    "enabled": false,
    "smtp_host": "",
    "smtp_port": 587,
    "sender": "",
    "password": "",
    "recipients": []
  }
}
```

| 通道        | 说明         |
| --------- | ---------- |
| `message` | 消息通道通知     |
| `webhook` | Webhook 推送 |
| `email`   | 邮件通知       |

### 2.9 RAG 配置 (rag.json)

```json
{
  "enabled": true,
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "dimension": 1536
  },
  "chunk": {
    "size": 512,
    "overlap": 64
  },
  "retrieval": {
    "top_k": 5,
    "min_score": 0.7
  }
}
```

| 字段                    | 说明       |
| --------------------- | -------- |
| `embedding.provider`  | 嵌入模型提供商  |
| `embedding.model`     | 嵌入模型名称   |
| `embedding.dimension` | 向量维度     |
| `chunk.size`          | 分块大小（字符） |
| `chunk.overlap`       | 分块重叠（字符） |
| `retrieval.top_k`     | 检索返回数量   |
| `retrieval.min_score` | 最小相似度阈值  |

### 2.10 多模态配置 (multimodal.json)

```json
{
  "vision": {
    "enabled": true,
    "follow_primary_model": true,
    "max_image_bytes": 6291456,
    "max_images_per_message": 20
  },
  "video": {
    "enabled": true,
    "max_video_bytes": 16777216,
    "max_duration_seconds": 120
  },
  "screenshot": {
    "browser_enabled": true,
    "screen_enabled": true
  },
  "media": {
    "storage_dir": "",
    "ttl_seconds": 120,
    "http_port": 42873
  }
}
```

| 模块           | 说明                    |
| ------------ | --------------------- |
| `vision`     | 图片理解（跟随主模型 Vision 能力） |
| `video`      | 视频理解（关键帧提取）           |
| `screenshot` | 截图功能（浏览器/屏幕）          |
| `media`      | 媒体文件存储                |

***

## 三、功能模块详解

### 3.1 工具系统

Lotte 内置以下工具：

| 工具名称                 | 类别      | 说明          |
| -------------------- | ------- | ----------- |
| `exec`               | Shell   | 执行 Shell 命令 |
| `read`               | File    | 读取文件内容      |
| `write`              | File    | 写入文件        |
| `edit`               | File    | 编辑文件（搜索替换）  |
| `list_dir`           | File    | 列出目录内容      |
| `browser_navigate`   | Browser | 浏览器导航       |
| `browser_screenshot` | Browser | 浏览器截图       |
| `browser_click`      | Browser | 点击元素        |
| `browser_fill`       | Browser | 填充表单        |
| `browser_extract`    | Browser | 提取内容        |
| `browser_execute`    | Browser | 执行脚本        |
| `http_fetch`         | Network | HTTP 请求     |
| `web_search`         | Network | 网络搜索        |
| `git`                | Git     | Git 操作      |
| `code_search`        | Code    | 代码搜索        |
| `code_analyze`       | Code    | 代码分析        |
| `audit_query`        | Audit   | 审计日志查询      |
| `audit_stats`        | Audit   | 审计统计        |

### 3.2 技能系统

#### 内置技能

| 技能名称            | 说明             |
| --------------- | -------------- |
| `file-reader`   | 文件读取与分析        |
| `code-review`   | 代码审查（安全、质量、性能） |
| `doc-generator` | 文档生成           |
| `task-planner`  | 任务规划           |
| `data-analyzer` | 数据分析           |

#### 自定义技能

在 `~/.lotte/skills/` 目录下创建 `SKILL.md` 文件：

```markdown
---
name: my-skill
version: 1.0.0
description: My custom skill
tags:
  - custom
  - example
---

# My Skill

技能描述和使用说明...

## Capabilities
- 功能1
- 功能2

## Guidelines
- 指南1
- 指南2
```

### 3.3 灵魂系统

灵魂系统用于定义智能体的人格特征，配置文件位于 `~/.lotte/soul/` 目录：

#### SOUL.md - 智能体人格

```markdown
---
name: Lotte
emoji: 🤖
bio: 我是 Lotte，一个智能助手
traits:
  - 友好
  - 专业
  - 耐心
communication_style: 简洁明了，专业友好
decision_framework: 基于用户需求优先
core_principles:
  - 保护用户隐私
  - 提供准确信息
  - 持续学习改进
---

# Lotte 人格定义

详细的人格描述...
```

#### PROFILE.md - 用户画像

```markdown
---
user_name: User
preferences:
  language: zh-CN
  style: casual
communication_preferences: 简洁回复
interests:
  - 编程
  - AI
---

# 用户画像

用户偏好设置...
```

#### AGENTS.md - 智能体规则

```markdown
---
rules:
  - name: 安全检查
    description: 执行敏感操作前需确认
    priority: critical
  - name: 代码规范
    description: 遵循项目代码规范
    priority: high
workflows:
  - name: 代码审查流程
    trigger: code_review
    steps:
      - 检查安全漏洞
      - 检查代码质量
      - 生成审查报告
tools_enabled:
  - exec
  - read
  - write
tools_disabled:
  - browser_navigate
custom_instructions: |
  自定义指令...
---

# 智能体规则

详细规则定义...
```

### 3.4 记忆系统

#### 短期记忆

- 存储当前会话的消息历史
- 自动管理上下文窗口
- 支持按 Token 数量限制

| 配置                     | 默认值    | 说明         |
| ---------------------- | ------ | ---------- |
| `shortTermMaxMessages` | 100    | 最大消息数      |
| `shortTermMaxTokens`   | 128000 | 最大 Token 数 |

#### 长期记忆

- 向量化存储重要信息
- 语义搜索检索
- 自动压缩旧记忆

| 配置                   | 默认值   | 说明     |
| -------------------- | ----- | ------ |
| `longTermMaxEntries` | 10000 | 最大条目数  |
| `autoStoreThreshold` | 0.8   | 自动存储阈值 |

### 3.5 自动化系统

#### 定时任务 (Cron)

通过 API 创建定时任务：

```bash
POST /api/v1/cron/jobs
{
  "name": "每日报告",
  "cron_expression": "0 9 * * *",
  "prompt": "生成今日工作总结",
  "enabled": true
}
```

支持的 Cron 表达式：

- 标准 Cron：`分 时 日 月 周`
- 固定间隔：`*/5 * * * *`（每5分钟）
- 指定时间：`0 9 * * 1-5`（工作日早9点）

#### 工作流 (Workflow)

工作流编排支持：

- 顺序执行
- 条件分支
- 循环迭代
- 错误处理

#### 事件触发 (Trigger)

事件触发规则：

- 消息事件
- 工具调用事件
- 系统事件
- 自定义事件

### 3.6 RAG 知识库

#### 文档上传

支持格式：

- PDF
- TXT
- MD (Markdown)

#### 使用流程

1. 上传文档到 `~/.lotte/rag/` 目录
2. 系统自动分块和向量化
3. 对话时自动检索相关内容

#### API 接口

```bash
# 上传文档
POST /api/v1/rag/documents

# 查询知识库
GET /api/v1/rag/search?q=查询内容

# 删除文档
DELETE /api/v1/rag/documents/:docId
```

### 3.7 多模态功能

#### 图片理解

- 跟随主模型的 Vision 能力
- 支持多图输入
- 自动压缩大图

| 配置                       | 默认值 | 说明       |
| ------------------------ | --- | -------- |
| `max_image_bytes`        | 6MB | 单图最大大小   |
| `max_images_per_message` | 20  | 单消息最大图片数 |

#### 视频理解

- 关键帧提取
- 需要系统安装 ffmpeg

| 配置                     | 默认值  | 说明      |
| ---------------------- | ---- | ------- |
| `max_video_bytes`      | 16MB | 视频最大大小  |
| `max_duration_seconds` | 120  | 最大时长（秒） |

#### 截图功能

- 浏览器截图：通过 Playwright
- 屏幕截图：跨平台支持

### 3.8 安全机制

#### 操作审批

敏感操作需要用户确认：

| 工具      | 默认审批 |
| ------- | ---- |
| bash    | 是    |
| file    | 否    |
| browser | 是    |
| network | 否    |
| git     | 是    |

#### VM 沙箱

- 隔离执行环境
- 资源限制（内存、超时）
- 安全审计

#### 审计日志

记录所有关键操作：

- 工具调用
- 配置变更
- 认证事件
- 审批操作

***

## 四、API 接口参考

### 4.1 基础信息

- **Base URL**: `http://127.0.0.1:10623`
- **API 前缀**: `/api/v1`
- **认证方式**: 根据 `gateway.json` 配置

### 4.2 接口列表

#### 健康检查

```
GET /health
```

#### 会话管理

| 方法     | 路径                     | 说明     |
| ------ | ---------------------- | ------ |
| GET    | `/api/v1/sessions`     | 获取会话列表 |
| GET    | `/api/v1/sessions/:id` | 获取会话详情 |
| DELETE | `/api/v1/sessions/:id` | 删除会话   |

#### 对话

| 方法   | 路径                               | 说明   |
| ---- | -------------------------------- | ---- |
| POST | `/api/v1/chat/:sessionId`        | 发送消息 |
| POST | `/api/v1/chat/:sessionId/stream` | 流式响应 |

#### 配置

| 方法  | 路径                        | 说明     |
| --- | ------------------------- | ------ |
| GET | `/api/v1/config`          | 获取全部配置 |
| GET | `/api/v1/config/:section` | 获取指定配置 |
| PUT | `/api/v1/config/:section` | 更新指定配置 |

#### 工具

| 方法   | 路径                            | 说明     |
| ---- | ----------------------------- | ------ |
| GET  | `/api/v1/tools`               | 获取工具列表 |
| POST | `/api/v1/tools/:name/execute` | 执行工具   |

#### 审批

| 方法   | 路径                             | 说明      |
| ---- | ------------------------------ | ------- |
| GET  | `/api/v1/approval/pending`     | 获取待审批操作 |
| POST | `/api/v1/approval/:id/approve` | 批准操作    |
| POST | `/api/v1/approval/:id/deny`    | 拒绝操作    |

#### MCP

| 方法     | 路径                                    | 说明      |
| ------ | ------------------------------------- | ------- |
| GET    | `/api/v1/mcp/clients`                 | 获取客户端列表 |
| POST   | `/api/v1/mcp/clients`                 | 添加客户端   |
| DELETE | `/api/v1/mcp/clients/:name`           | 删除客户端   |
| POST   | `/api/v1/mcp/clients/:name/reconnect` | 重连客户端   |

#### 技能

| 方法   | 路径                             | 说明     |
| ---- | ------------------------------ | ------ |
| GET  | `/api/v1/skills/builtin/list`  | 获取内置技能 |
| GET  | `/api/v1/skills/list`          | 获取所有技能 |
| POST | `/api/v1/skills/:name/enable`  | 启用技能   |
| POST | `/api/v1/skills/:name/disable` | 禁用技能   |

#### 通道

| 方法   | 路径                               | 说明     |
| ---- | -------------------------------- | ------ |
| GET  | `/api/v1/channels`               | 获取通道列表 |
| POST | `/api/v1/channels/:type/start`   | 启动通道   |
| POST | `/api/v1/channels/:type/stop`    | 停止通道   |
| POST | `/api/v1/channels/:type/restart` | 重启通道   |

#### 自动化

| 方法     | 路径                          | 说明     |
| ------ | --------------------------- | ------ |
| GET    | `/api/v1/cron/jobs`         | 获取定时任务 |
| POST   | `/api/v1/cron/jobs`         | 创建任务   |
| PUT    | `/api/v1/cron/jobs/:id`     | 更新任务   |
| DELETE | `/api/v1/cron/jobs/:id`     | 删除任务   |
| POST   | `/api/v1/cron/jobs/:id/run` | 手动执行   |

#### 日志

| 方法  | 路径                    | 说明   |
| --- | --------------------- | ---- |
| GET | `/api/v1/logs`        | 获取日志 |
| GET | `/api/v1/logs/stream` | 流式日志 |

#### OpenAI 兼容

| 方法   | 路径                     | 说明          |
| ---- | ---------------------- | ----------- |
| POST | `/v1/chat/completions` | OpenAI 兼容接口 |

### 4.3 WebSocket 事件

连接地址：`ws://127.0.0.1:10623/ws`

| 事件类型                 | 说明     |
| -------------------- | ------ |
| `chat.chunk`         | 对话流式片段 |
| `chat.done`          | 对话完成   |
| `chat.error`         | 对话错误   |
| `tool.call`          | 工具调用   |
| `tool.result`        | 工具结果   |
| `approval.request`   | 审批请求   |
| `approval.resolved`  | 审批结果   |
| `channel.message`    | 通道消息   |
| `channel.status`     | 通道状态   |
| `cron.job_started`   | 任务开始   |
| `cron.job_completed` | 任务完成   |
| `cron.job_failed`    | 任务失败   |
| `workflow.started`   | 工作流开始  |
| `workflow.completed` | 工作流完成  |
| `workflow.failed`    | 工作流失败  |
| `system.started`     | 系统启动   |
| `system.stopped`     | 系统停止   |

***

## 五、快速开始

### 5.1 安装

```bash
cd d:\Trae项目\lotte-agent
npm install
```

### 5.2 配置

1. 创建配置目录：

```bash
mkdir ~/.lotte/config
```

1. 创建 AI 配置文件 `~/.lotte/config/ai.json`：

```json
{
  "default_provider": "openai",
  "default_model": "gpt-4o",
  "providers": {
    "openai": {
      "api_url": "https://api.openai.com/v1",
      "api_key": "your-api-key",
      "models": {}
    }
  }
}
```

### 5.3 启动

```bash
# 启动后端服务
npm run start

# 启动前端开发服务器（另一个终端）
cd Web && npm run dev
```

### 5.4 访问

- Web 界面：<http://localhost:3000>
- API 接口：<http://127.0.0.1:10623>

***

## 六、常见问题

### Q: 前端无法连接后端？

1. 确认后端服务已启动
2. 检查 `gateway.json` 中的 `host` 和 `port`
3. 如需外部访问，将 `host` 改为 `0.0.0.0`
4. 检查防火墙设置

### Q: 如何启用认证？

在 `gateway.json` 中配置：

```json
{
  "auth": {
    "mode": "token",
    "token": "your-secret-token"
  }
}
```

### Q: 配置文件在哪里？

| 文件                  | 说明      |
| ------------------- | ------- |
| `lotte.json`        | 主配置     |
| `ai.json`           | AI 模型配置 |
| `gateway.json`      | 网关配置    |
| `channels.json`     | 通道配置    |
| `mcp.json`          | MCP 配置  |
| `skills.json`       | 技能配置    |
| `tools.json`        | 工具配置    |
| `automation.json`   | 自动化配置   |
| `notification.json` | 通知配置    |
| `rag.json`          | RAG 配置  |
| `multimodal.json`   | 多模态配置   |

### Q: 如何添加自定义 MCP 服务器？

1. 编辑 `~/.lotte/config/mcp.json`
2. 添加客户端配置
3. 重启服务或调用重连 API

### Q: 如何创建自定义技能？

1. 在 `~/.lotte/skills/` 创建目录
2. 创建 `SKILL.md` 文件
3. 添加 YAML frontmatter 和内容
4. 系统自动扫描加载

***

## 七、目录结构

```
~/.lotte/
├── config/                    # 配置文件目录
│   ├── lotte.json            # 主配置
│   ├── ai.json               # AI 模型配置
│   ├── gateway.json          # 网关配置
│   ├── channels.json         # 通道配置
│   ├── mcp.json              # MCP 配置
│   ├── skills.json           # 技能配置
│   ├── tools.json            # 工具配置
│   ├── automation.json       # 自动化配置
│   ├── notification.json     # 通知配置
│   ├── rag.json              # RAG 配置
│   └── multimodal.json       # 多模态配置
├── data/                      # 数据目录
│   └── lotte.db              # SQLite 数据库
├── soul/                      # 灵魂系统
│   ├── SOUL.md               # 智能体人格
│   ├── PROFILE.md            # 用户画像
│   ├── AGENTS.md             # 智能体规则
│   └── MEMORY.md             # 记忆文件
├── skills/                    # 自定义技能
│   └── my-skill/
│       └── SKILL.md
├── rag/                       # RAG 知识库
│   └── documents/            # 上传的文档
└── logs/                      # 日志目录
```

