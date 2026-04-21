# Lotte API 接口文档

## 概述

Lotte 网关提供 RESTful API 和 WebSocket RPC 两种通信方式。REST API 基于 Fastify 框架，遵循统一的请求/响应格式；WebSocket 基于 RPC 帧协议，支持双向实时通信。

- **Base URL**: `http://127.0.0.1:10623`
- **API 前缀**: `/api/v1`
- **协议**: HTTP/1.1, WebSocket
- **数据格式**: JSON
- **字符编码**: UTF-8

***

## 认证

认证模式由 `gateway.json` 中的 `auth.mode` 决定，支持三种模式：

| 模式         | 说明                        | 请求头                                                                  |
| ---------- | ------------------------- | -------------------------------------------------------------------- |
| `none`     | 无需认证                      | 无                                                                    |
| `token`    | Bearer Token 认证           | `Authorization: Bearer <token>`                                      |
| `password` | Basic Auth 或 Bearer Token | `Authorization: Basic <base64>` 或 `Authorization: Bearer <password>` |

**公开路径**（无需认证）：

- `/v1/chat/completions`
- `/v1/models`
- `/health`

认证失败时返回 `401` 状态码，响应头包含 `WWW-Authenticate` 提示。

***

## 通用响应格式

### 成功响应

```json
{
  "ok": true,
  "data": { }
}
```

### 错误响应

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description",
    "details": null
  }
}
```

### 常见错误码

| HTTP 状态码 | 错误码                   | 说明          |
| -------- | --------------------- | ----------- |
| 400      | `VALIDATION_ERROR`    | 请求参数校验失败    |
| 400      | `INVALID_MODULE`      | 无效的配置模块名    |
| 400      | `BAD_REQUEST`         | 请求格式错误      |
| 401      | `AUTH_FAILED`         | 认证失败        |
| 404      | `NOT_FOUND`           | 资源不存在       |
| 404      | `SESSION_NOT_FOUND`   | 会话不存在       |
| 404      | `TOOL_NOT_FOUND`      | 工具不存在       |
| 404      | `APPROVAL_NOT_FOUND`  | 审批请求不存在     |
| 409      | `CONFLICT`            | 资源冲突（如已存在）  |
| 500      | `INTERNAL_ERROR`      | 服务器内部错误     |
| 503      | `SERVICE_UNAVAILABLE` | 服务未初始化      |
| 502      | `HUB_ERROR`           | 外部服务（Hub）错误 |

***

## 健康检查

### GET /health

获取服务器健康状态（无需认证）。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "status": "running",
    "version": "0.1.0",
    "uptime": 3600.123,
    "memory": {
      "rss": 134217728,
      "heapTotal": 67108864,
      "heapUsed": 33554432,
      "external": 1048576
    },
    "timestamp": 1713523200000
  }
}
```

### GET /api/v1/health

同 `/health`，但响应不包含 `memory` 字段。

***

## 会话管理

### GET /api/v1/sessions

获取所有会话列表。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "sessions": [
      {
        "session_id": "abc-123",
        "channel_id": "web",
        "title": null,
        "status": "active",
        "model": "gpt-4o",
        "created_at": 1713523200000,
        "updated_at": 1713523200000,
        "metadata_json": "{\"maxTurns\":25}"
      }
    ]
  }
}
```

### POST /api/v1/sessions

创建新会话。

**请求体**：

| 字段         | 类型     | 必填 | 说明      |
| ---------- | ------ | -- | ------- |
| `model`    | string | 否  | 使用的模型名称 |
| `maxTurns` | number | 否  | 最大推理轮数  |

**请求示例**：

```json
{
  "model": "gpt-4o",
  "maxTurns": 25
}
```

**响应示例**（状态码 201）：

```json
{
  "ok": true,
  "data": {
    "id": "abc-123",
    "model": "gpt-4o",
    "maxTurns": 25,
    "status": "active",
    "createdAt": 1713523200000
  }
}
```

### GET /api/v1/sessions/:id

获取指定会话详情。

**路径参数**：

| 参数   | 类型     | 说明    |
| ---- | ------ | ----- |
| `id` | string | 会话 ID |

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "id": "abc-123",
    "model": "gpt-4o",
    "maxTurns": 25,
    "status": "active"
  }
}
```

**错误响应**：

```json
{
  "ok": false,
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "Session not found: abc-123",
    "details": null
  }
}
```

### DELETE /api/v1/sessions/:id

删除指定会话（软删除，状态标记为 `deleted`）。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "id": "abc-123",
    "status": "deleted"
  }
}
```

### GET /api/v1/sessions/:id/messages

获取指定会话的消息列表。

**查询参数**：

| 参数       | 类型     | 默认值 | 说明           |
| -------- | ------ | --- | ------------ |
| `limit`  | number | 50  | 每页数量（最大 200） |
| `offset` | number | 0   | 偏移量          |

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "messages": [
      {
        "message_id": "msg-1",
        "session_id": "abc-123",
        "role": "user",
        "content": "你好",
        "created_at": 1713523200000
      }
    ],
    "total": 10,
    "limit": 50,
    "offset": 0
  }
}
```

### POST /api/v1/sessions/:id/compact

压缩指定会话的上下文，减少 Token 使用。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "sessionId": "abc-123",
    "originalCount": 50,
    "compactedCount": 5,
    "tokensSaved": 12000
  }
}
```

***

## 对话

### POST /api/v1/chat/send

发送对话消息。

**请求体**：

| 字段          | 类型      | 必填 | 说明            |
| ----------- | ------- | -- | ------------- |
| `sessionId` | string  | 是  | 会话 ID         |
| `message`   | string  | 是  | 用户消息内容        |
| `stream`    | boolean | 否  | 是否使用 SSE 流式响应 |

**非流式请求示例**：

```json
{
  "sessionId": "abc-123",
  "message": "你好，请帮我分析这段代码",
  "stream": false
}
```

**非流式响应示例**：

```json
{
  "ok": true,
  "data": {
    "sessionId": "abc-123",
    "response": "好的，我来帮你分析...",
    "toolCallsMade": 2,
    "totalTokens": 1500,
    "turns": 3,
    "finished": true,
    "finishReason": "stop"
  }
}
```

**流式响应**（`stream: true`）：

返回 `Content-Type: text/event-stream`，SSE 事件格式：

```
event: message
data: {"type":"start","sessionId":"abc-123"}

event: message
data: {"type":"text","content":"好的，我来帮你分析..."}

event: done
data: {"type":"done","usage":{"promptTokens":0,"completionTokens":1500},"turns":3,"finished":true,"finishReason":"stop"}
```

**错误 SSE 事件**：

```
event: error
data: {"type":"error","message":"Error description"}
```

### POST /api/v1/chat/abort

中止正在进行的对话。

**请求体**：

| 字段          | 类型     | 必填 | 说明    |
| ----------- | ------ | -- | ----- |
| `sessionId` | string | 是  | 会话 ID |

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "sessionId": "abc-123",
    "aborted": true
  }
}
```

***

## 配置管理

### GET /api/v1/config/schema

获取配置模块列表和版本。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "modules": ["main", "ai", "gateway", "channels", "mcp", "skills", "tools", "automation", "notification", "rag", "multimodal"],
    "version": "1.0.0"
  }
}
```

### GET /api/v1/config/:module

获取指定模块的配置。

**路径参数**：

| 参数       | 类型     | 说明    |
| -------- | ------ | ----- |
| `module` | string | 配置模块名 |

**有效模块名**：`main`、`ai`、`gateway`、`channels`、`mcp`、`skills`、`tools`、`automation`、`notification`、`rag`、`multimodal`

**请求示例**：

```
GET /api/v1/config/ai
```

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "default_provider": "openai",
    "default_model": "gpt-4o",
    "providers": {
      "openai": {
        "api_url": "https://api.openai.com/v1",
        "api_key": "sk-***",
        "models": {}
      }
    }
  }
}
```

**错误响应**（无效模块名）：

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_MODULE",
    "message": "Invalid config module: invalid",
    "details": {
      "validModules": ["main", "ai", "gateway", "channels", "mcp", "skills", "tools", "automation", "notification", "rag", "multimodal"]
    }
  }
}
```

### PUT /api/v1/config/:module

更新指定模块的配置。

**请求体**：对应模块的完整配置对象。

**请求示例**：

```
PUT /api/v1/config/ai
```

```json
{
  "default_provider": "anthropic",
  "default_model": "claude-sonnet-4-20250514"
}
```

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "module": "ai",
    "updated": true
  }
}
```

***

## 工具管理

### GET /api/v1/tools

获取所有已注册工具列表。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "tools": [
      {
        "name": "exec",
        "description": "Execute shell commands",
        "category": "Shell",
        "requiresApproval": true,
        "dangerous": true,
        "readOnly": false
      },
      {
        "name": "read",
        "description": "Read file contents",
        "category": "File",
        "requiresApproval": false,
        "dangerous": false,
        "readOnly": true
      }
    ],
    "categories": ["Shell", "File", "Browser", "Network", "Git", "Code", "Audit"],
    "total": 18
  }
}
```

### GET /api/v1/tools/:name

获取指定工具的详细信息。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "name": "exec",
    "description": "Execute shell commands",
    "category": "Shell",
    "requiresApproval": true,
    "dangerous": true,
    "readOnly": false,
    "parameters": [
      {
        "name": "command",
        "description": "The command to execute",
        "optional": false
      },
      {
        "name": "timeout",
        "description": "Timeout in milliseconds",
        "optional": true
      }
    ]
  }
}
```

### POST /api/v1/tools/:name/invoke

调用指定工具。

**请求体**：

| 字段     | 类型     | 必填 | 说明   |
| ------ | ------ | -- | ---- |
| `args` | object | 否  | 工具参数 |

**请求示例**：

```json
{
  "args": {
    "command": "echo hello"
  }
}
```

**响应示例**（直接执行）：

```json
{
  "ok": true,
  "data": {
    "tool": "exec",
    "result": "hello\n"
  }
}
```

**响应示例**（需要审批，状态码 202）：

```json
{
  "ok": true,
  "data": {
    "status": "pending_approval",
    "message": "Tool \"exec\" requires approval. Use /api/v1/approvals endpoints to manage approvals."
  }
}
```

***

## 审批管理

### GET /api/v1/approvals/pending

获取所有待审批请求列表。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "approvals": [
      {
        "id": "approval-1",
        "sessionId": "abc-123",
        "toolName": "exec",
        "toolCategory": "Shell",
        "riskLevel": "high",
        "description": "Execute shell command",
        "arguments": { "command": "rm -rf /tmp/test" },
        "createdAt": 1713523200000,
        "expiresAt": 1713523500000
      }
    ],
    "total": 1
  }
}
```

### POST /api/v1/approvals/:id/approve

批准审批请求。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "id": "approval-1",
    "status": "approved"
  }
}
```

### POST /api/v1/approvals/:id/reject

拒绝审批请求。

**请求体**：

| 字段       | 类型     | 必填 | 说明   |
| -------- | ------ | -- | ---- |
| `reason` | string | 否  | 拒绝原因 |

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "id": "approval-1",
    "status": "rejected",
    "reason": "Dangerous command"
  }
}
```

***

## MCP 客户端管理

### GET /api/v1/mcp

获取所有 MCP 客户端列表。

**响应示例**：

```json
{
  "ok": true,
  "data": [
    {
      "key": "my-server",
      "name": "my-server",
      "description": "My MCP Server",
      "enabled": true,
      "transport": "stdio",
      "url": "",
      "headers": {},
      "command": "npx",
      "args": ["my-mcp-server"],
      "env": { "API_KEY": "sk***rd" },
      "cwd": "",
      "status": "connected",
      "error": null
    }
  ]
}
```

> 注意：响应中的 `headers` 和 `env` 值已脱敏处理。

### GET /api/v1/mcp/status

获取 MCP 系统整体状态。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "total": 3,
    "connected": 2,
    "error": 1,
    "disabled": 0
  }
}
```

### GET /api/v1/mcp/:key

获取指定 MCP 客户端详情。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "key": "my-server",
    "name": "my-server",
    "description": "My MCP Server",
    "enabled": true,
    "transport": "stdio",
    "url": "",
    "headers": {},
    "command": "npx",
    "args": ["my-mcp-server"],
    "env": {},
    "cwd": "",
    "status": "connected",
    "error": null
  }
}
```

### GET /api/v1/mcp/:key/tools

获取指定 MCP 客户端提供的工具列表。

**响应示例**：

```json
{
  "ok": true,
  "data": [
    {
      "name": "my_tool",
      "description": "A custom tool",
      "inputSchema": { }
    }
  ]
}
```

### POST /api/v1/mcp

创建新的 MCP 客户端。

**请求体**：

| 字段            | 类型        | 必填   | 说明                                                |
| ------------- | --------- | ---- | ------------------------------------------------- |
| `key`         | string    | 是    | 客户端唯一标识                                           |
| `name`        | string    | 是    | 客户端名称                                             |
| `description` | string    | 否    | 描述                                                |
| `enabled`     | boolean   | 否    | 是否启用（默认 true）                                     |
| `transport`   | string    | 否    | 传输方式：`stdio` / `streamable_http` / `sse`          |
| `command`     | string    | 条件必填 | stdio 传输的启动命令（transport=stdio 时必填）                |
| `args`        | string\[] | 否    | 命令参数                                              |
| `url`         | string    | 条件必填 | HTTP/SSE 服务地址（transport=streamable\_http/sse 时必填） |
| `headers`     | object    | 否    | HTTP 请求头                                          |
| `env`         | object    | 否    | 环境变量                                              |
| `cwd`         | string    | 否    | 工作目录                                              |

**请求示例**：

```json
{
  "key": "my-server",
  "name": "my-server",
  "description": "My MCP Server",
  "transport": "stdio",
  "command": "npx",
  "args": ["my-mcp-server"],
  "env": { "API_KEY": "sk-xxx" }
}
```

**响应示例**（状态码 201）：

```json
{
  "ok": true,
  "data": {
    "key": "my-server",
    "name": "my-server",
    "description": "My MCP Server",
    "enabled": true,
    "transport": "stdio",
    "url": "",
    "headers": {},
    "command": "npx",
    "args": ["my-mcp-server"],
    "env": {},
    "cwd": "",
    "status": "unknown",
    "error": null
  }
}
```

### PUT /api/v1/mcp/:key

更新指定 MCP 客户端配置。

**请求体**：与创建请求相同，但所有字段均为可选（仅更新提供的字段）。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "key": "my-server",
    "name": "my-server",
    "enabled": true,
    "transport": "stdio",
    "status": "connected",
    "error": null
  }
}
```

### PATCH /api/v1/mcp/:key/toggle

切换 MCP 客户端的启用/禁用状态。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "key": "my-server",
    "enabled": false,
    "status": "unknown",
    "error": null
  }
}
```

### DELETE /api/v1/mcp/:key

删除指定 MCP 客户端。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "message": "MCP client 'my-server' deleted successfully"
  }
}
```

***

## 技能管理

### GET /api/v1/skills

获取所有已安装技能列表。

**响应示例**：

```json
{
  "ok": true,
  "data": [
    {
      "name": "file-reader",
      "version": "1.0.0",
      "description": "File reading and analysis",
      "enabled": true,
      "source": "builtin",
      "tags": ["file", "analysis"]
    }
  ]
}
```

### GET /api/v1/skills/:name

获取指定技能详情。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "name": "file-reader",
    "version": "1.0.0",
    "description": "File reading and analysis",
    "enabled": true,
    "source": "builtin",
    "content": "# File Reader\n\nSkill content...",
    "tags": ["file", "analysis"],
    "references": {},
    "scripts": {}
  }
}
```

### POST /api/v1/skills

创建新技能。

**请求体**：

| 字段            | 类型        | 必填 | 说明                       |
| ------------- | --------- | -- | ------------------------ |
| `name`        | string    | 是  | 技能名称                     |
| `content`     | string    | 是  | 技能内容（SKILL.md 内容）        |
| `version`     | string    | 否  | 版本号（默认 0.1.0）            |
| `description` | string    | 否  | 描述                       |
| `tags`        | string\[] | 否  | 标签                       |
| `source`      | string    | 否  | 来源：local / hub / builtin |
| `sourceUrl`   | string    | 否  | 来源 URL                   |
| `references`  | object    | 否  | 引用                       |
| `scripts`     | object    | 否  | 脚本                       |

**请求示例**：

```json
{
  "name": "my-skill",
  "content": "# My Skill\n\nCustom skill content...",
  "description": "My custom skill",
  "tags": ["custom"]
}
```

**响应示例**（状态码 201）：

```json
{
  "ok": true,
  "data": {
    "name": "my-skill",
    "version": "0.1.0",
    "description": "My custom skill",
    "enabled": true,
    "source": "local",
    "content": "# My Skill\n\nCustom skill content...",
    "tags": ["custom"]
  }
}
```

### PUT /api/v1/skills/:name

更新指定技能。

**请求体**：

| 字段            | 类型        | 必填 | 说明   |
| ------------- | --------- | -- | ---- |
| `description` | string    | 否  | 描述   |
| `content`     | string    | 否  | 内容   |
| `enabled`     | boolean   | 否  | 是否启用 |
| `tags`        | string\[] | 否  | 标签   |
| `references`  | object    | 否  | 引用   |
| `scripts`     | object    | 否  | 脚本   |

### PATCH /api/v1/skills/:name/toggle

切换技能的启用/禁用状态。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "name": "my-skill",
    "enabled": false
  }
}
```

### DELETE /api/v1/skills/:name

删除指定技能。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "message": "Skill 'my-skill' deleted successfully"
  }
}
```

### GET /api/v1/skills/builtin/list

获取所有内置技能定义。

**响应示例**：

```json
{
  "ok": true,
  "data": [
    {
      "name": "file-reader",
      "version": "1.0.0",
      "description": "File reading and analysis",
      "tags": ["file", "analysis"]
    }
  ]
}
```

### POST /api/v1/skills/builtin/install

安装内置技能。

**请求体**：

| 字段     | 类型     | 必填 | 说明     |
| ------ | ------ | -- | ------ |
| `name` | string | 是  | 内置技能名称 |

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "name": "file-reader",
    "version": "1.0.0",
    "enabled": true,
    "source": "builtin"
  }
}
```

### POST /api/v1/skills/hub/search

从技能市场搜索技能。

**请求体**：

| 字段       | 类型     | 必填 | 说明     |
| -------- | ------ | -- | ------ |
| `query`  | string | 是  | 搜索关键词  |
| `limit`  | number | 否  | 返回数量限制 |
| `offset` | number | 否  | 偏移量    |

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "results": [
      {
        "slug": "code-review",
        "name": "Code Review",
        "description": "Automated code review skill",
        "version": "1.2.0",
        "author": "lotte-community"
      }
    ],
    "total": 1
  }
}
```

### POST /api/v1/skills/hub/install

从技能市场安装技能。

**请求体**：

| 字段        | 类型     | 必填 | 说明   |
| --------- | ------ | -- | ---- |
| `slug`    | string | 是  | 技能标识 |
| `version` | string | 否  | 指定版本 |

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "name": "code-review",
    "version": "1.2.0",
    "source": "hub",
    "enabled": true
  }
}
```

### POST /api/v1/skills/:name/scan

对指定技能进行安全扫描。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "name": "my-skill",
    "safe": true,
    "issues": [],
    "warnings": []
  }
}
```

***

## 通道管理

### GET /api/v1/channels

获取所有消息通道状态。

**响应示例**：

```json
{
  "ok": true,
  "data": [
    {
      "type": "weixin",
      "status": "running",
      "messageCount": 150,
      "connectedAt": 1713523200000,
      "error": null
    },
    {
      "type": "qq",
      "status": "stopped",
      "messageCount": 0,
      "connectedAt": null,
      "error": null
    }
  ]
}
```

### GET /api/v1/channels/:type

获取指定类型通道的详情。

**路径参数**：

| 参数     | 类型     | 说明                              |
| ------ | ------ | ------------------------------- |
| `type` | string | 通道类型：`weixin` / `qq` / `feishu` |

### POST /api/v1/channels/:type/start

启动指定通道。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "type": "weixin",
    "status": "running"
  }
}
```

### POST /api/v1/channels/:type/stop

停止指定通道。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "type": "weixin",
    "status": "stopped"
  }
}
```

### POST /api/v1/channels/send

跨通道发送消息。

**请求体**：

| 字段             | 类型     | 必填 | 说明    |
| -------------- | ------ | -- | ----- |
| `channel_type` | string | 是  | 通道类型  |
| `to_handle`    | string | 是  | 接收者标识 |
| `text`         | string | 是  | 消息内容  |
| `meta`         | object | 否  | 附加元数据 |

**请求示例**：

```json
{
  "channel_type": "weixin",
  "to_handle": "user-123",
  "text": "Hello from Lotte!"
}
```

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "sent": true
  }
}
```

***

## 自动化

### 定时任务

#### GET /api/v1/cron/jobs

获取所有定时任务列表。

**响应示例**：

```json
{
  "ok": true,
  "data": [
    {
      "id": "job-1",
      "name": "每日报告",
      "schedule": { "kind": "cron", "expr": "0 9 * * *", "tz": "Asia/Shanghai" },
      "prompt": "生成今日工作总结",
      "enabled": true,
      "lastRunAt": 1713523200000,
      "nextRunAt": 1713609600000
    }
  ]
}
```

#### POST /api/v1/cron/jobs

创建定时任务。

**请求体**：

| 字段                 | 类型      | 必填   | 说明                            |
| ------------------ | ------- | ---- | ----------------------------- |
| `name`             | string  | 是    | 任务名称                          |
| `schedule`         | object  | 是    | 调度配置                          |
| `schedule.kind`    | string  | 是    | 调度类型：`cron` / `every` / `at`  |
| `schedule.expr`    | string  | 条件必填 | Cron 表达式（kind=cron 时必填）       |
| `schedule.everyMs` | number  | 条件必填 | 间隔毫秒数，>= 1000（kind=every 时必填） |
| `schedule.at`      | number  | 条件必填 | 执行时间戳，需大于当前时间（kind=at 时必填）    |
| `schedule.tz`      | string  | 否    | 时区（kind=cron 时可用）             |
| `prompt`           | string  | 是    | 执行的提示词                        |
| `channelId`        | string  | 否    | 关联通道 ID                       |
| `sessionId`        | string  | 否    | 关联会话 ID                       |
| `enabled`          | boolean | 否    | 是否启用                          |
| `deleteAfterRun`   | boolean | 否    | 执行后自动删除                       |

**请求示例**：

```json
{
  "name": "每日报告",
  "schedule": { "kind": "cron", "expr": "0 9 * * *", "tz": "Asia/Shanghai" },
  "prompt": "生成今日工作总结",
  "enabled": true
}
```

**响应示例**（状态码 201）：

```json
{
  "ok": true,
  "data": {
    "id": "job-1",
    "name": "每日报告",
    "schedule": { "kind": "cron", "expr": "0 9 * * *", "tz": "Asia/Shanghai" },
    "prompt": "生成今日工作总结",
    "enabled": true
  }
}
```

#### PUT /api/v1/cron/jobs/:id

更新定时任务。

**请求体**：与创建请求相同，但所有字段均为可选。

#### DELETE /api/v1/cron/jobs/:id

删除定时任务。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "deleted": true
  }
}
```

#### POST /api/v1/cron/jobs/:id/run

手动触发定时任务执行。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "id": "job-1",
    "status": "running",
    "startedAt": 1713523200000
  }
}
```

### 工作流

#### GET /api/v1/workflows

获取所有工作流列表。

#### POST /api/v1/workflows/:id/run

执行指定工作流。

**请求体**：

| 字段          | 类型     | 必填 | 说明    |
| ----------- | ------ | -- | ----- |
| `variables` | object | 否  | 工作流变量 |

### 触发规则

#### GET /api/v1/triggers

获取所有触发规则列表。

### 事件历史

#### GET /api/v1/events/history

获取事件历史记录。

**查询参数**：

| 参数      | 类型     | 默认值 | 说明     |
| ------- | ------ | --- | ------ |
| `event` | string | -   | 过滤事件类型 |
| `limit` | number | 50  | 返回数量限制 |

***

## RAG 知识库

### GET /api/v1/rag/documents

获取文档列表。

**查询参数**：

| 参数       | 类型     | 默认值 | 说明           |
| -------- | ------ | --- | ------------ |
| `limit`  | number | 100 | 每页数量（最大 500） |
| `offset` | number | 0   | 偏移量          |

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "documents": [
      {
        "doc_id": "doc-1",
        "filename": "report.pdf",
        "chunk_count": 25,
        "created_at": 1713523200000
      }
    ],
    "total": 1,
    "limit": 100,
    "offset": 0
  }
}
```

### POST /api/v1/rag/documents

上传文档到知识库。

**请求体**：

| 字段          | 类型     | 必填 | 说明     |
| ----------- | ------ | -- | ------ |
| `file_path` | string | 是  | 文件绝对路径 |

**请求示例**：

```json
{
  "file_path": "C:/Users/user/documents/report.pdf"
}
```

**响应示例**（状态码 201）：

```json
{
  "ok": true,
  "data": {
    "document": {
      "doc_id": "doc-1",
      "filename": "report.pdf",
      "chunk_count": 25,
      "created_at": 1713523200000
    }
  }
}
```

### DELETE /api/v1/rag/documents/:id

删除指定文档。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "id": "doc-1",
    "deleted": true
  }
}
```

### POST /api/v1/rag/search

语义搜索知识库。

**请求体**：

| 字段          | 类型     | 必填 | 说明              |
| ----------- | ------ | -- | --------------- |
| `query`     | string | 是  | 搜索查询            |
| `top_k`     | number | 否  | 返回数量（默认 5）      |
| `min_score` | number | 否  | 最小相似度阈值（默认 0.7） |

**请求示例**：

```json
{
  "query": "如何配置 MCP 客户端",
  "top_k": 5,
  "min_score": 0.7
}
```

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "results": [
      {
        "chunk_id": "chunk-1",
        "doc_id": "doc-1",
        "text": "MCP 客户端配置说明...",
        "score": 0.92,
        "filename": "mcp-guide.pdf",
        "start_offset": 0,
        "end_offset": 512
      }
    ],
    "total": 1
  }
}
```

### GET /api/v1/rag/stats

获取知识库统计信息。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "documentCount": 15,
    "chunkCount": 375
  }
}
```

***

## 通知管理

### GET /api/v1/notification/config

获取通知配置。

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "rules": [],
    "webhook": {
      "url": "",
      "method": "POST",
      "headers": {},
      "enabled": false
    },
    "email": {
      "smtp_host": "",
      "smtp_port": 587,
      "from": "",
      "to": [],
      "enabled": false
    }
  }
}
```

### POST /api/v1/notification/rules

添加通知规则。

**请求体**：

| 字段                  | 类型        | 必填 | 说明                                   |
| ------------------- | --------- | -- | ------------------------------------ |
| `name`              | string    | 是  | 规则名称                                 |
| `eventTypes`        | string\[] | 是  | 触发事件类型列表                             |
| `channels`          | object\[] | 是  | 通知渠道列表                               |
| `channels[].type`   | string    | 是  | 渠道类型：`message` / `webhook` / `email` |
| `channels[].target` | string    | 是  | 目标地址                                 |
| `enabled`           | boolean   | 否  | 是否启用（默认 true）                        |

### PUT /api/v1/notification/rules/:ruleId

更新通知规则。

**请求体**：

| 字段           | 类型        | 必填 | 说明     |
| ------------ | --------- | -- | ------ |
| `enabled`    | boolean   | 否  | 是否启用   |
| `name`       | string    | 否  | 规则名称   |
| `eventTypes` | string\[] | 否  | 触发事件类型 |

### DELETE /api/v1/notification/rules/:ruleId

删除通知规则。

### PUT /api/v1/notification/webhook

更新 Webhook 通知配置。

**请求体**：

| 字段        | 类型      | 必填 | 说明          |
| --------- | ------- | -- | ----------- |
| `url`     | string  | 否  | Webhook URL |
| `method`  | string  | 否  | HTTP 方法     |
| `headers` | object  | 否  | 请求头         |
| `enabled` | boolean | 否  | 是否启用        |

### PUT /api/v1/notification/email

更新邮件通知配置。

**请求体**：

| 字段          | 类型        | 必填 | 说明       |
| ----------- | --------- | -- | -------- |
| `smtp_host` | string    | 否  | SMTP 服务器 |
| `smtp_port` | number    | 否  | SMTP 端口  |
| `from`      | string    | 否  | 发件人      |
| `to`        | string\[] | 否  | 收件人列表    |
| `enabled`   | boolean   | 否  | 是否启用     |

### POST /api/v1/notification/test

测试通知渠道。

**请求体**：

| 字段        | 类型     | 必填 | 说明                                   |
| --------- | ------ | -- | ------------------------------------ |
| `channel` | string | 是  | 渠道类型：`webhook` / `email` / `message` |

***

## 插件管理

### GET /api/plugins

获取所有已注册插件列表。

**响应示例**：

```json
{
  "ok": true,
  "data": [
    {
      "name": "my-plugin",
      "version": "1.0.0",
      "description": "My custom plugin",
      "author": "developer",
      "status": "active",
      "error": null,
      "loadedAt": 1713523200000,
      "tools": ["custom_tool"],
      "hooks": ["before-tool-call"],
      "routes": ["/api/plugins/my-plugin/action"]
    }
  ]
}
```

### GET /api/plugins/active

获取所有活跃插件列表。

### GET /api/plugins/discover

发现可用插件（扫描 plugins 目录）。

### GET /api/plugins/:name

获取指定插件详情。

### GET /api/plugins/:name/tools

获取指定插件注册的工具列表。

### POST /api/plugins/install

安装插件。

**请求体**：

| 字段     | 类型     | 必填 | 说明   |
| ------ | ------ | -- | ---- |
| `name` | string | 是  | 插件名称 |

### POST /api/plugins/:name/activate

激活插件。

**请求体**：

| 字段       | 类型     | 必填 | 说明   |
| -------- | ------ | -- | ---- |
| `config` | object | 否  | 插件配置 |

### POST /api/plugins/:name/deactivate

停用插件。

### DELETE /api/plugins/:name

移除插件。

***

## 审计日志

### GET /api/v1/logs

查询审计日志。

**查询参数**：

| 参数          | 类型     | 默认值 | 说明                                     |
| ----------- | ------ | --- | -------------------------------------- |
| `sessionId` | string | -   | 按会话 ID 过滤                              |
| `toolName`  | string | -   | 按工具名称过滤                                |
| `action`    | string | -   | 按操作类型过滤                                |
| `result`    | string | -   | 按结果过滤：`success` / `failure` / `denied` |
| `startTime` | string | -   | 起始时间戳（毫秒）                              |
| `endTime`   | string | -   | 结束时间戳（毫秒）                              |
| `limit`     | number | 20  | 每页数量（最大 100）                           |
| `offset`    | number | 0   | 偏移量                                    |

**请求示例**：

```
GET /api/v1/logs?toolName=exec&result=success&limit=10
```

**响应示例**：

```json
{
  "ok": true,
  "data": {
    "logs": [
      {
        "id": "log-1",
        "sessionId": "abc-123",
        "toolName": "exec",
        "action": "execute",
        "result": "success",
        "arguments": { "command": "echo hello" },
        "output": "hello\n",
        "timestamp": 1713523200000
      }
    ],
    "total": 50,
    "limit": 10,
    "offset": 0
  }
}
```

***

## OpenAI 兼容接口

### GET /v1/models

获取可用模型列表（无需认证）。

**响应示例**：

```json
{
  "object": "list",
  "data": [
    {
      "id": "openai/gpt-4o",
      "object": "model",
      "created": 1713523200,
      "owned_by": "openai"
    }
  ]
}
```

### POST /v1/chat/completions

OpenAI 兼容的对话接口（无需认证）。

**请求体**：

| 字段                   | 类型      | 必填 | 说明                                          |
| -------------------- | ------- | -- | ------------------------------------------- |
| `model`              | string  | 否  | 模型名称（默认使用配置的默认模型）                           |
| `messages`           | array   | 是  | 消息列表                                        |
| `messages[].role`    | string  | 是  | 角色：`system` / `user` / `assistant` / `tool` |
| `messages[].content` | string  | 是  | 消息内容                                        |
| `stream`             | boolean | 否  | 是否流式响应                                      |
| `temperature`        | number  | 否  | 温度参数                                        |
| `max_tokens`         | number  | 否  | 最大输出 Token                                  |
| `tools`              | array   | 否  | 工具定义                                        |

**非流式请求示例**：

```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "user", "content": "Hello!" }
  ]
}
```

**非流式响应示例**：

```json
{
  "id": "chatcmpl-abc-123",
  "object": "chat.completion",
  "created": 1713523200,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 10,
    "total_tokens": 10
  }
}
```

**流式响应**（`stream: true`）：

返回 `Content-Type: text/event-stream`，遵循 OpenAI SSE 格式：

```
data: {"id":"chatcmpl-abc-123","object":"chat.completion.chunk","created":1713523200,"model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-abc-123","object":"chat.completion.chunk","created":1713523200,"model":"gpt-4o","choices":[{"index":0,"delta":{"content":"Hello!"},"finish_reason":null}]}

data: {"id":"chatcmpl-abc-123","object":"chat.completion.chunk","created":1713523200,"model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

***

## WebSocket RPC 协议

### 连接

连接地址：`ws://127.0.0.1:10623/ws`

最大负载：5MB，心跳间隔：30 秒，心跳超时：60 秒。

### 帧格式

#### 请求帧 (RequestFrame)

```json
{
  "type": "req",
  "id": "unique-request-id",
  "method": "method.name",
  "params": {}
}
```

#### 响应帧 (ResponseFrame)

```json
{
  "type": "res",
  "id": "unique-request-id",
  "ok": true,
  "payload": {}
}
```

错误响应：

```json
{
  "type": "res",
  "id": "unique-request-id",
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description",
    "retryable": false,
    "retryAfterMs": null
  }
}
```

#### 事件帧 (EventFrame)

```json
{
  "type": "event",
  "event": "event.name",
  "payload": {},
  "seq": 1
}
```

### 连接认证

客户端连接后必须首先发送 `connect` 请求进行认证：

```json
{
  "type": "req",
  "id": "1",
  "method": "connect",
  "params": {
    "auth": {
      "token": "your-secret-token"
    },
    "client": {
      "id": "my-client",
      "version": "1.0.0",
      "platform": "web",
      "mode": "default"
    }
  }
}
```

认证成功响应：

```json
{
  "type": "res",
  "id": "1",
  "ok": true,
  "payload": {
    "type": "hello-ok",
    "protocol": 1,
    "server": {
      "version": "0.1.0",
      "connId": "client-uuid"
    },
    "features": {
      "methods": ["connect", "chat.send", "chat.abort", "sessions.list", "sessions.create", "sessions.delete", "sessions.compact", "config.get", "config.set", "tools.catalog", "tools.invoke", "approval.pending", "approval.resolve", "logs.tail"],
      "events": ["tick", "agent.message", "agent.done", "agent.error", "approval.request", "config.changed", "shutdown"]
    },
    "policy": {
      "maxPayload": 5242880,
      "maxBufferedBytes": 1048576,
      "tickIntervalMs": 30000
    }
  }
}
```

认证失败时，连接将被关闭（代码 4001）。

### RPC 方法

| 方法                 | 参数                          | 说明      |
| ------------------ | --------------------------- | ------- |
| `connect`          | `{ auth, client }`          | 连接认证    |
| `chat.send`        | `{ sessionId, message }`    | 发送对话消息  |
| `chat.abort`       | `{ sessionId }`             | 中止对话    |
| `sessions.list`    | -                           | 获取会话列表  |
| `sessions.create`  | `{ model?, maxTurns? }`     | 创建会话    |
| `sessions.delete`  | `{ sessionId }`             | 删除会话    |
| `sessions.compact` | `{ sessionId, maxTokens? }` | 压缩会话上下文 |
| `config.get`       | `{ module }`                | 获取配置    |
| `config.set`       | `{ module, data }`          | 更新配置    |
| `tools.catalog`    | -                           | 获取工具目录  |
| `tools.invoke`     | `{ name, args }`            | 调用工具    |
| `approval.pending` | -                           | 获取待审批列表 |
| `approval.resolve` | `{ id, approved, reason? }` | 审批操作    |
| `logs.tail`        | -                           | 获取最近日志  |

### 事件类型

| 事件                 | 触发条件     | Payload                              |
| ------------------ | -------- | ------------------------------------ |
| `tick`             | 每 30 秒心跳 | `{ ts: number }`                     |
| `agent.message`    | 智能体产生消息  | `{ sessionId, type, content }`       |
| `agent.done`       | 智能体完成推理  | `{ sessionId, aborted? }`            |
| `agent.error`      | 智能体出错    | `{ sessionId, error }`               |
| `approval.request` | 新审批请求    | `{ id, approved, reason? }`          |
| `config.changed`   | 配置变更     | 变更的配置数据                              |
| `shutdown`         | 服务器关闭    | `{ reason: "Server shutting down" }` |

***

## 接口总览

| 分类     | 方法     | 路径                                   | 说明         |
| ------ | ------ | ------------------------------------ | ---------- |
| 健康检查   | GET    | `/health`                            | 服务器健康状态    |
| 健康检查   | GET    | `/api/v1/health`                     | API 健康状态   |
| 会话     | GET    | `/api/v1/sessions`                   | 会话列表       |
| 会话     | POST   | `/api/v1/sessions`                   | 创建会话       |
| 会话     | GET    | `/api/v1/sessions/:id`               | 会话详情       |
| 会话     | DELETE | `/api/v1/sessions/:id`               | 删除会话       |
| 会话     | GET    | `/api/v1/sessions/:id/messages`      | 会话消息       |
| 会话     | POST   | `/api/v1/sessions/:id/compact`       | 压缩上下文      |
| 对话     | POST   | `/api/v1/chat/send`                  | 发送消息       |
| 对话     | POST   | `/api/v1/chat/abort`                 | 中止对话       |
| 配置     | GET    | `/api/v1/config/schema`              | 配置模块列表     |
| 配置     | GET    | `/api/v1/config/:module`             | 获取配置       |
| 配置     | PUT    | `/api/v1/config/:module`             | 更新配置       |
| 工具     | GET    | `/api/v1/tools`                      | 工具列表       |
| 工具     | GET    | `/api/v1/tools/:name`                | 工具详情       |
| 工具     | POST   | `/api/v1/tools/:name/invoke`         | 调用工具       |
| 审批     | GET    | `/api/v1/approvals/pending`          | 待审批列表      |
| 审批     | POST   | `/api/v1/approvals/:id/approve`      | 批准         |
| 审批     | POST   | `/api/v1/approvals/:id/reject`       | 拒绝         |
| MCP    | GET    | `/api/v1/mcp`                        | 客户端列表      |
| MCP    | GET    | `/api/v1/mcp/status`                 | 系统状态       |
| MCP    | GET    | `/api/v1/mcp/:key`                   | 客户端详情      |
| MCP    | GET    | `/api/v1/mcp/:key/tools`             | 客户端工具      |
| MCP    | POST   | `/api/v1/mcp`                        | 创建客户端      |
| MCP    | PUT    | `/api/v1/mcp/:key`                   | 更新客户端      |
| MCP    | PATCH  | `/api/v1/mcp/:key/toggle`            | 切换启用状态     |
| MCP    | DELETE | `/api/v1/mcp/:key`                   | 删除客户端      |
| 技能     | GET    | `/api/v1/skills`                     | 技能列表       |
| 技能     | GET    | `/api/v1/skills/:name`               | 技能详情       |
| 技能     | POST   | `/api/v1/skills`                     | 创建技能       |
| 技能     | PUT    | `/api/v1/skills/:name`               | 更新技能       |
| 技能     | PATCH  | `/api/v1/skills/:name/toggle`        | 切换启用状态     |
| 技能     | DELETE | `/api/v1/skills/:name`               | 删除技能       |
| 技能     | GET    | `/api/v1/skills/builtin/list`        | 内置技能列表     |
| 技能     | POST   | `/api/v1/skills/builtin/install`     | 安装内置技能     |
| 技能     | POST   | `/api/v1/skills/hub/search`          | 搜索技能市场     |
| 技能     | POST   | `/api/v1/skills/hub/install`         | 安装市场技能     |
| 技能     | POST   | `/api/v1/skills/:name/scan`          | 安全扫描       |
| 通道     | GET    | `/api/v1/channels`                   | 通道列表       |
| 通道     | GET    | `/api/v1/channels/:type`             | 通道详情       |
| 通道     | POST   | `/api/v1/channels/:type/start`       | 启动通道       |
| 通道     | POST   | `/api/v1/channels/:type/stop`        | 停止通道       |
| 通道     | POST   | `/api/v1/channels/send`              | 跨通道发送      |
| 自动化    | GET    | `/api/v1/cron/jobs`                  | 定时任务列表     |
| 自动化    | POST   | `/api/v1/cron/jobs`                  | 创建定时任务     |
| 自动化    | PUT    | `/api/v1/cron/jobs/:id`              | 更新定时任务     |
| 自动化    | DELETE | `/api/v1/cron/jobs/:id`              | 删除定时任务     |
| 自动化    | POST   | `/api/v1/cron/jobs/:id/run`          | 手动执行       |
| 自动化    | GET    | `/api/v1/workflows`                  | 工作流列表      |
| 自动化    | POST   | `/api/v1/workflows/:id/run`          | 执行工作流      |
| 自动化    | GET    | `/api/v1/triggers`                   | 触发规则列表     |
| 自动化    | GET    | `/api/v1/events/history`             | 事件历史       |
| RAG    | GET    | `/api/v1/rag/documents`              | 文档列表       |
| RAG    | POST   | `/api/v1/rag/documents`              | 上传文档       |
| RAG    | DELETE | `/api/v1/rag/documents/:id`          | 删除文档       |
| RAG    | POST   | `/api/v1/rag/search`                 | 语义搜索       |
| RAG    | GET    | `/api/v1/rag/stats`                  | 统计信息       |
| 通知     | GET    | `/api/v1/notification/config`        | 通知配置       |
| 通知     | POST   | `/api/v1/notification/rules`         | 添加规则       |
| 通知     | PUT    | `/api/v1/notification/rules/:ruleId` | 更新规则       |
| 通知     | DELETE | `/api/v1/notification/rules/:ruleId` | 删除规则       |
| 通知     | PUT    | `/api/v1/notification/webhook`       | 更新 Webhook |
| 通知     | PUT    | `/api/v1/notification/email`         | 更新邮件配置     |
| 通知     | POST   | `/api/v1/notification/test`          | 测试通知       |
| 插件     | GET    | `/api/plugins`                       | 插件列表       |
| 插件     | GET    | `/api/plugins/active`                | 活跃插件       |
| 插件     | GET    | `/api/plugins/discover`              | 发现插件       |
| 插件     | GET    | `/api/plugins/:name`                 | 插件详情       |
| 插件     | GET    | `/api/plugins/:name/tools`           | 插件工具       |
| 插件     | POST   | `/api/plugins/install`               | 安装插件       |
| 插件     | POST   | `/api/plugins/:name/activate`        | 激活插件       |
| 插件     | POST   | `/api/plugins/:name/deactivate`      | 停用插件       |
| 插件     | DELETE | `/api/plugins/:name`                 | 移除插件       |
| 日志     | GET    | `/api/v1/logs`                       | 审计日志查询     |
| OpenAI | GET    | `/v1/models`                         | 模型列表       |
| OpenAI | POST   | `/v1/chat/completions`               | 对话补全       |

