# Web 网关应用文档

## 概述

Lotte Web 网关应用是 Lotte 智能体平台的前端控制面板，提供可视化的管理界面，用于对话交互、会话管理、技能管理、MCP 客户端管理、消息通道管理、自动化任务管理、日志查看、系统配置和 RAG 知识库管理。

Web 前端基于 Next.js 16 + Tailwind CSS 4 + shadcn/ui 构建，通过 HTTP REST API 和 WebSocket 与后端网关服务通信。

---

## 系统架构

```
┌─────────────────────────────────────────────────┐
│                 Web Frontend (Next.js)           │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Sidebar  │ │ Topbar   │ │  Main Content    │ │
│  │ Navigation│ │ Controls │ │  (View Router)   │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────────────────────────────────────────┐ │
│  │  API Client (HTTP)  │  WS Client (WebSocket) │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────┬──────────────────────────┘
                       │ HTTP / WebSocket
┌──────────────────────┴──────────────────────────┐
│              Gateway (Fastify)                    │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌───────────┐ │
│  │ REST   │ │ WS     │ │ Auth   │ │ OpenAI    │ │
│  │ Routes │ │ Manager│ │ Middleware│ Compat   │ │
│  └────────┘ └────────┘ └────────┘ └───────────┘ │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────┴──────────────────────────┐
│              Lotte Core Engine                    │
│  Agent │ Memory │ Tools │ Skills │ MCP │ Channels│
└─────────────────────────────────────────────────┘
```

---

## 安装

### 环境要求

- Node.js >= 20.19.0
- npm >= 10.0.0
- 操作系统：Windows 10 / macOS / Linux

### 安装步骤

1. **进入 Web 目录**

```bash
cd d:\Trae项目\lotte-agent\Web
```

2. **安装依赖**

```bash
npm install
```

3. **启动开发服务器**

```bash
npm run dev
```

4. **构建生产版本**

```bash
npm run build
```

5. **启动生产服务器**

```bash
npm run start
```

---

## 配置

### 后端网关配置

Web 前端连接的后端网关服务配置文件位于 `~/.lotte/config/gateway.json`：

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

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `host` | string | `127.0.0.1` | 网关监听地址 |
| `port` | number | `10623` | 网关监听端口 |
| `auth.mode` | string | `none` | 认证模式：`none` / `token` / `password` |
| `auth.token` | string | `""` | Token 认证密钥 |
| `auth.password` | string | `""` | 密码认证 |
| `websocket.max_connections` | number | `10` | 最大 WebSocket 连接数 |
| `websocket.heartbeat_interval` | number | `30000` | 心跳间隔（毫秒） |

### 前端环境变量

通过环境变量配置前端连接后端网关的地址：

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `NEXT_PUBLIC_API_BASE` | `http://127.0.0.1:10623` | 后端 API 基础地址 |
| `NEXT_PUBLIC_WS_BASE` | `ws://127.0.0.1:10623` | WebSocket 基础地址 |

可在 Web 项目根目录创建 `.env.local` 文件设置：

```
NEXT_PUBLIC_API_BASE=http://127.0.0.1:10623
NEXT_PUBLIC_WS_BASE=ws://127.0.0.1:10623
```

### AI 模型配置

AI 模型配置文件位于 `~/.lotte/config/ai.json`：

```json
{
  "default_provider": "openai",
  "default_model": "gpt-4o",
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

| 字段 | 类型 | 说明 |
|------|------|------|
| `default_provider` | string | 默认 AI 提供商 |
| `default_model` | string | 默认模型名称 |
| `providers.<name>.api_url` | string | API 地址 |
| `providers.<name>.api_key` | string | API 密钥 |
| `providers.<name>.models` | object | 模型配置（context_window, max_output） |
| `model_aliases` | object | 模型别名映射 |

### 通道配置

消息通道配置文件位于 `~/.lotte/config/channels.json`：

```json
{
  "weixin": {
    "enabled": false,
    "bot_token": "",
    "bot_prefix": "",
    "dm_policy": "open",
    "group_policy": "open"
  },
  "qq": {
    "enabled": false,
    "app_id": "",
    "client_secret": "",
    "bot_prefix": "",
    "markdown_enabled": true
  },
  "feishu": {
    "enabled": false,
    "app_id": "",
    "app_secret": "",
    "bot_prefix": "",
    "domain": "feishu",
    "dm_policy": "open",
    "group_policy": "open"
  }
}
```

### MCP 配置

MCP 客户端配置文件位于 `~/.lotte/config/mcp.json`：

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

| 字段 | 类型 | 说明 |
|------|------|------|
| `transport` | string | 传输方式：`stdio` / `streamable_http` / `sse` |
| `command` | string | stdio 传输的启动命令 |
| `args` | string[] | 命令参数 |
| `url` | string | HTTP/SSE 传输的服务地址 |
| `headers` | object | HTTP 请求头 |
| `env` | object | 环境变量 |

### 自动化配置

自动化配置文件位于 `~/.lotte/config/automation.json`：

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

### 工具配置

工具配置文件位于 `~/.lotte/config/tools.json`：

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

---

## 使用指南

### 启动应用

1. **启动后端网关服务**

```bash
cd d:\Trae项目\lotte-agent
npm run start
```

2. **启动前端开发服务器**

```bash
cd d:\Trae项目\lotte-agent\Web
npm run dev
```

3. **访问界面**

打开浏览器访问 `http://localhost:3000`

### 功能模块

#### 1. 对话（Chat）

- 与 AI 智能体进行实时对话
- 支持多会话管理
- 显示工具调用过程和结果
- 支持流式响应
- 消息复制和重新生成

#### 2. 会话管理（Sessions）

- 查看所有历史会话
- 创建新会话
- 删除会话
- 快速切换到指定会话

#### 3. 技能管理（Skills）

- 查看内置技能和已安装技能
- 启用/禁用技能
- 查看技能描述和状态

#### 4. MCP 管理（MCP）

- 查看所有 MCP 客户端状态
- 添加新的 MCP 客户端（支持 stdio / streamable_http / sse 传输）
- 移除 MCP 客户端
- 重新连接 MCP 客户端
- 查看客户端工具数量

#### 5. 通道管理（Channels）

- 查看消息通道状态（微信 / QQ / 飞书）
- 启动/停止/重启通道
- 查看消息计数和连接时间
- 查看通道错误信息

#### 6. 自动化管理（Automation）

- **定时任务（Cron）**：创建、编辑、删除定时任务
  - 支持 Cron 表达式调度
  - 支持固定间隔调度
  - 支持指定时间点执行
  - 查看任务运行状态和下次运行时间
  - 手动触发任务执行
- **工作流（Workflows）**：工作流管理（预留）
- **触发规则（Triggers）**：事件触发规则管理（预留）
- **事件（Events）**：事件总线监控（预留）

#### 7. 日志查看（Logs）

- 实时查看系统日志
- 按日志级别筛选（Error / Warn / Info / Debug）
- 关键词搜索
- 查看日志分类和时间戳

#### 8. 系统配置（Settings）

- AI 模型配置（JSON 编辑器）
- 网关配置
- 工具配置
- 通道配置
- 保存配置后自动生效

#### 9. RAG 管理（RAG）

- 文档上传（拖拽上传）
- 知识库管理
- 支持 PDF / TXT / MD 格式

---

## API 接口

### 基础信息

- **Base URL**: `http://127.0.0.1:10623`
- **API 前缀**: `/api/v1`
- **认证方式**: 根据 `gateway.json` 中的 `auth.mode` 配置
  - `none`: 无需认证
  - `token`: 请求头 `Authorization: Bearer <token>`
  - `password`: 请求头 `Authorization: Bearer <password>`

### 通用响应格式

```json
{
  "ok": true,
  "data": {}
}
```

错误响应：

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description"
  }
}
```

### 接口列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |
| GET | `/api/v1/sessions` | 获取会话列表 |
| POST | `/api/v1/chat/:sessionId` | 发送消息 |
| DELETE | `/api/v1/sessions/:id` | 删除会话 |
| GET | `/api/v1/config` | 获取全部配置 |
| PUT | `/api/v1/config/:section` | 更新指定配置 |
| GET | `/api/v1/tools` | 获取工具列表 |
| GET | `/api/v1/approval/pending` | 获取待审批操作 |
| POST | `/api/v1/approval/:id/approve` | 批准操作 |
| POST | `/api/v1/approval/:id/deny` | 拒绝操作 |
| GET | `/api/v1/logs` | 获取日志 |
| GET | `/api/v1/mcp/clients` | 获取 MCP 客户端列表 |
| POST | `/api/v1/mcp/clients` | 添加 MCP 客户端 |
| DELETE | `/api/v1/mcp/clients/:name` | 删除 MCP 客户端 |
| POST | `/api/v1/mcp/clients/:name/reconnect` | 重连 MCP 客户端 |
| GET | `/api/v1/skills/builtin/list` | 获取技能列表 |
| POST | `/api/v1/skills/:name/enable` | 启用技能 |
| POST | `/api/v1/skills/:name/disable` | 禁用技能 |
| GET | `/api/v1/channels` | 获取通道列表 |
| POST | `/api/v1/channels/:type/start` | 启动通道 |
| POST | `/api/v1/channels/:type/stop` | 停止通道 |
| POST | `/api/v1/channels/:type/restart` | 重启通道 |
| GET | `/api/v1/cron/jobs` | 获取定时任务列表 |
| POST | `/api/v1/cron/jobs` | 创建定时任务 |
| PUT | `/api/v1/cron/jobs/:id` | 更新定时任务 |
| DELETE | `/api/v1/cron/jobs/:id` | 删除定时任务 |
| POST | `/api/v1/cron/jobs/:id/run` | 手动运行定时任务 |
| POST | `/v1/chat/completions` | OpenAI 兼容接口 |

### WebSocket 接口

连接地址：`ws://127.0.0.1:10623/ws`

#### 事件类型

| 事件类型 | 说明 |
|----------|------|
| `chat.chunk` | 对话流式响应片段 |
| `chat.done` | 对话完成 |
| `chat.error` | 对话错误 |
| `tool.call` | 工具调用 |
| `tool.result` | 工具结果 |
| `approval.request` | 审批请求 |
| `approval.resolved` | 审批结果 |
| `channel.message` | 通道消息 |
| `channel.status` | 通道状态变更 |
| `cron.job_started` | 定时任务开始 |
| `cron.job_completed` | 定时任务完成 |
| `cron.job_failed` | 定时任务失败 |
| `workflow.started` | 工作流开始 |
| `workflow.completed` | 工作流完成 |
| `workflow.failed` | 工作流失败 |
| `system.started` | 系统启动 |
| `system.stopped` | 系统停止 |

#### 事件格式

```json
{
  "type": "chat.chunk",
  "data": {},
  "timestamp": 1713523200000
}
```

---

## 项目结构

```
Web/
├── public/                     # 静态资源
├── src/
│   ├── app/
│   │   ├── favicon.ico         # 网站图标
│   │   ├── globals.css         # 全局样式（Tailwind + shadcn/ui 主题变量）
│   │   ├── layout.tsx          # 根布局
│   │   └── page.tsx            # 主页面（集成布局、WebSocket、健康检查）
│   ├── components/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx     # 侧边栏导航
│   │   │   ├── topbar.tsx      # 顶栏（标题、刷新、暗黑模式切换）
│   │   │   └── main-content.tsx # 主内容区视图路由
│   │   ├── ui/                 # shadcn/ui 组件库
│   │   │   ├── avatar.tsx
│   │   │   ├── badge.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── dropdown-menu.tsx
│   │   │   ├── input.tsx
│   │   │   ├── label.tsx
│   │   │   ├── popover.tsx
│   │   │   ├── scroll-area.tsx
│   │   │   ├── select.tsx
│   │   │   ├── separator.tsx
│   │   │   ├── sheet.tsx
│   │   │   ├── skeleton.tsx
│   │   │   ├── switch.tsx
│   │   │   ├── table.tsx
│   │   │   ├── tabs.tsx
│   │   │   ├── textarea.tsx
│   │   │   └── tooltip.tsx
│   │   └── views/
│   │       ├── chat-view.tsx       # 对话界面
│   │       ├── sessions-view.tsx   # 会话管理
│   │       ├── skills-view.tsx     # 技能管理
│   │       ├── mcp-view.tsx        # MCP 管理
│   │       ├── channels-view.tsx   # 通道管理
│   │       ├── automation-view.tsx # 自动化管理
│   │       ├── logs-view.tsx       # 日志查看
│   │       ├── config-view.tsx     # 系统配置
│   │       └── rag-view.tsx        # RAG 管理
│   └── lib/
│       ├── api-client.ts       # HTTP API 客户端
│       ├── ws-client.ts        # WebSocket 客户端
│       ├── store.ts            # Zustand 全局状态管理
│       ├── utils.ts            # 工具函数（cn 等）
│       └── i18n/
│           ├── index.ts        # 国际化核心
│           ├── zh.json         # 中文翻译
│           └── en.json         # 英文翻译
├── components.json             # shadcn/ui 配置
├── next.config.ts              # Next.js 配置
├── package.json                # 项目依赖
├── postcss.config.mjs          # PostCSS 配置
└── tsconfig.json               # TypeScript 配置
```

---

## 技术栈

| 技术 | 版本 | 说明 |
|------|------|------|
| Next.js | 16.2.4 | React 全栈框架 |
| React | 19.2.4 | UI 库 |
| TypeScript | 5.x | 类型安全 |
| Tailwind CSS | 4.x | 原子化 CSS |
| shadcn/ui | New York 风格 | UI 组件库 |
| Zustand | 5.x | 状态管理 |
| Radix UI | 最新 | 无障碍 UI 原语 |
| Lucide React | 1.8.x | 图标库 |

---

## 开发指南

### 添加新页面

1. 在 `src/components/views/` 下创建新的视图组件
2. 在 `src/components/layout/main-content.tsx` 的 `viewMap` 中注册
3. 在 `src/components/layout/sidebar.tsx` 的 `navItems` 中添加导航项
4. 在 `src/lib/i18n/zh.json` 和 `en.json` 中添加翻译

### 添加新的 UI 组件

使用 shadcn/ui CLI 或手动创建组件到 `src/components/ui/` 目录。

### 状态管理

使用 Zustand 全局状态管理，定义在 `src/lib/store.ts`。包含以下状态模块：

- **连接状态**：`connected`、`sidebarOpen`、`activeView`、`darkMode`
- **会话数据**：`sessions`、`activeSessionId`、`messages`
- **业务数据**：`cronJobs`、`channels`、`mcpClients`、`skills`、`logs`、`config`

### 国际化

国际化系统定义在 `src/lib/i18n/` 目录：

- `t(key)` 函数获取翻译文本
- `setLocale(locale)` 切换语言
- 支持 `zh`（中文）和 `en`（英文）

---

## 常见问题

### Q: 前端无法连接后端？

1. 确认后端网关服务已启动（默认端口 10623）
2. 检查 `gateway.json` 中的 `host` 和 `port` 配置
3. 如需远程访问，将 `host` 改为 `0.0.0.0`
4. 检查防火墙设置

### Q: 如何启用认证？

在 `~/.lotte/config/gateway.json` 中配置 `auth` 字段：

```json
{
  "auth": {
    "mode": "token",
    "token": "your-secret-token"
  }
}
```

重启后端服务后，前端 API 客户端会自动携带 Token。

### Q: 如何切换暗黑模式？

点击顶栏右侧的月亮/太阳图标切换。暗黑模式会自动保存到本地状态。

### Q: 构建时出现 `workStore` 错误？

这是 Next.js 16 在 monorepo 环境下的已知 bug，不影响开发模式运行。使用 `npm run dev` 启动开发服务器即可正常使用。

### Q: 配置文件在哪里？

所有配置文件位于 `~/.lotte/config/` 目录：

| 文件 | 说明 |
|------|------|
| `lotte.json` | 主配置 |
| `ai.json` | AI 模型配置 |
| `gateway.json` | 网关配置 |
| `channels.json` | 通道配置 |
| `mcp.json` | MCP 配置 |
| `skills.json` | 技能配置 |
| `tools.json` | 工具配置 |
| `automation.json` | 自动化配置 |
| `notification.json` | 通知配置 |
| `rag.json` | RAG 配置 |
| `multimodal.json` | 多模态配置 |

可通过环境变量 `LOTTE_STATE_DIR` 自定义状态目录位置。
