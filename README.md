<p align="center">
  <h1 align="center">Lotte Agent</h1>
  <p align="center">
    多渠道通用智能体平台 — 具备自动化和编程开发能力
  </p>
  <p align="center">
    <img src="https://img.shields.io/badge/TypeScript-ES2023-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=node.js&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/License-MIT-blue" alt="License" />
    <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen" alt="PRs Welcome" />
  </p>
</p>

---

## 目录

- [项目简介](#项目简介)
- [核心特性](#核心特性)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [功能模块](#功能模块)
- [API接口](#api接口)
- [Web管理界面](#web管理界面)
- [插件开发](#插件开发)
- [开发指南](#开发指南)
- [参考项目](#参考项目)
- [许可证](#许可证)

---

## 项目简介

**Lotte** 是一个本地优先的多渠道通用智能体平台，采用 TypeScript 开发，具备自动化任务编排和编程开发能力。项目融合了 ReAct 推理引擎、多模型支持、MCP 协议、技能系统、记忆系统、灵魂系统等核心能力，并通过多渠道接入（微信/QQ/飞书）和 Web 网关实现全方位的智能体交互。

---

## 核心特性

### 🤖 智能体核心
- **ReAct 推理引擎**：支持多轮工具调用、自主决策、任务编排
- **多模型支持**：OpenAI、Anthropic Claude、Google Gemini、国产模型、自定义 API
- **灵魂系统**：通过 SOUL.md / PROFILE.md / AGENTS.md 定义智能体人格
- **记忆系统**：短期记忆 + 长期记忆 + 向量搜索 + 自动压缩

### 🔧 工具与扩展
- **内置工具集**：Bash 终端、文件操作、浏览器自动化、网络请求、Git 操作、代码分析
- **MCP 协议**：支持 stdio / streamable_http / sse 三种传输协议
- **技能系统**：SKILL.md 定义、内置技能、技能市场、安全扫描
- **插件系统**：完整的插件架构和 SDK，支持热重载

### 📡 多渠道接入
- **微信**：个人微信 iLink Bot HTTP API
- **QQ**：官方 Bot API（WebSocket 协议）
- **飞书**：官方 API
- **控制台**：内置终端交互通道

### ⚡ 自动化能力
- **定时任务**：Cron 表达式调度
- **工作流编排**：多步骤任务编排引擎
- **事件触发**：事件总线 + 规则引擎

### 🛡️ 安全机制
- **操作审批**：敏感操作需用户确认
- **VM 沙箱**：隔离执行环境
- **审计日志**：全链路操作记录
- **工具策略管道**：权限检查、审批控制

### 🌐 Web 网关
- **REST API**：Fastify 高性能 HTTP 服务
- **WebSocket**：实时双向通信
- **OpenAI 兼容接口**：兼容 OpenAI API 格式
- **管理界面**：React + Next.js 可视化管理

### 📚 其他能力
- **RAG**：文档上传、向量化存储、检索增强生成
- **多模态**：图片理解（Vision）、视频理解、截图
- **语音识别**：本地 Whisper / Whisper API 双模式
- **通知系统**：消息通道 / Webhook / 邮件多渠道通知
- **国际化**：中文 / 英文双语支持

---

## 技术栈

| 类别 | 技术选型 |
|------|---------|
| 核心语言 | TypeScript (ES2023, ESM) |
| 运行时 | Node.js >= 22.x |
| 包管理 | pnpm |
| 后端框架 | Fastify (高性能 HTTP) |
| 前端框架 | React 19 + Next.js 16 (App Router) |
| UI 样式 | Tailwind CSS 4 + shadcn/ui + Radix UI |
| 数据库 | SQLite (better-sqlite3) |
| 向量存储 | SQLite-vec (向量扩展) |
| WebSocket | ws |
| 配置校验 | Zod |
| 状态管理 | Zustand |
| 构建工具 | tsdown (后端) + Next.js (前端) |
| 测试 | Vitest |
| 代码质量 | ESLint + Prettier |
| 国际化 | next-intl |

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        消息通道层                                │
│   ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────────┐        │
│   │ 微信 │  │  QQ  │  │ 飞书 │  │控制台│  │ Web UI   │        │
│   └──┬───┘  └──┬───┘  └──┬───┘  └──┬───┘  └────┬─────┘        │
│      └─────────┴─────────┴─────────┴────────────┘              │
│                           │                                      │
│                    ChannelManager                                │
│                    UnifiedQueue                                  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                     Web 网关层 (Gateway)                         │
│   ┌────────────────┐  ┌────────────────┐  ┌─────────────────┐  │
│   │  REST API      │  │  WebSocket RPC │  │ OpenAI Compat   │  │
│   │  (Fastify)     │  │  (ws)          │  │  API            │  │
│   └────────────────┘  └────────────────┘  └─────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                     Agent 核心引擎                               │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│   │ ReAct Engine │  │ Session Mgr  │  │ Prompt Builder       │ │
│   └──────┬───────┘  └──────────────┘  └──────────────────────┘ │
│          │                                                      │
│   ┌──────┴───────────────────────────────────────────────────┐  │
│   │              Tool Policy Pipeline                        │  │
│   │   (权限检查 → 审批控制 → 沙箱隔离 → 工具执行)            │  │
│   └──────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                     能力扩展层                                    │
│   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐  │
│   │ 工具集 │ │  MCP   │ │ 技能   │ │ 插件   │ │ 自动化     │  │
│   │Bash/   │ │Client  │ │SKILL.md│ │Plugin  │ │Cron/       │  │
│   │File/   │ │Manager │ │Scanner │ │SDK     │ │Workflow/   │  │
│   │Browser │ │        │ │Hub     │ │        │ │Trigger     │  │
│   └────────┘ └────────┘ └────────┘ └────────┘ └────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                     基础设施层                                    │
│   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐  │
│   │ 配置   │ │ 数据库 │ │ 记忆   │ │ 安全   │ │ 日志/错误  │  │
│   │Loader  │ │SQLite  │ │Manager │ │Approval│ │Logger      │  │
│   │Watcher │ │SQLite  │ │Compactor│ │Sandbox │ │Dumper      │  │
│   │Schema  │ │-vec    │ │Vector  │ │Audit   │ │            │  │
│   └────────┘ └────────┘ └────────┘ └────────┘ └────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 项目结构

```
lotte-agent/
├── src/                              # 核心源码
│   ├── agent/                        # Agent 核心
│   │   ├── react-engine.ts           # ReAct 推理引擎
│   │   ├── session.ts                # 会话管理
│   │   └── tool-invoker.ts           # 工具调用器
│   ├── ai/                           # AI 模型管理
│   │   ├── model-manager.ts          # 模型管理器
│   │   ├── provider.ts               # Provider 基类
│   │   ├── openai-provider.ts        # OpenAI 适配器
│   │   ├── anthropic-provider.ts     # Anthropic 适配器
│   │   ├── custom-provider.ts        # 自定义 API 适配器
│   │   └── types.ts                  # 类型定义
│   ├── automation/                   # 自动化系统
│   │   ├── cron-scheduler.ts         # Cron 调度器
│   │   ├── workflow-engine.ts        # 工作流引擎
│   │   ├── event-bus.ts              # 事件总线
│   │   ├── trigger-manager.ts        # 触发器管理
│   │   └── manager.ts                # 自动化管理器
│   ├── channels/                     # 消息通道
│   │   ├── base.ts                   # 通道基类
│   │   ├── manager.ts                # 通道管理器
│   │   ├── registry.ts               # 通道注册表
│   │   ├── queue.ts                  # 统一队列
│   │   ├── renderer.ts               # 消息渲染器
│   │   ├── console/                  # 控制台通道
│   │   ├── weixin/                   # 微信通道
│   │   ├── qq/                       # QQ 通道
│   │   └── feishu/                   # 飞书通道
│   ├── config/                       # 配置管理
│   │   ├── loader.ts                 # 配置加载器
│   │   ├── schema.ts                 # Zod Schema 定义
│   │   ├── defaults.ts               # 默认配置值
│   │   ├── paths.ts                  # 路径管理
│   │   ├── templates.ts              # 模板生成器
│   │   └── watcher.ts                # 配置热更新
│   ├── db/                           # 数据库
│   │   └── database.ts               # SQLite 数据库
│   ├── errors/                       # 错误处理
│   │   ├── errors.ts                 # 错误定义
│   │   └── dumper.ts                 # 错误转储
│   ├── gateway/                      # Web 网关
│   │   ├── server.ts                 # Fastify HTTP 服务器
│   │   ├── auth.ts                   # 认证中间件
│   │   ├── websocket.ts              # WebSocket 管理
│   │   ├── events.ts                 # 事件系统
│   │   ├── openai-compat.ts          # OpenAI 兼容接口
│   │   └── routes/                   # API 路由
│   │       ├── chat.ts               # 对话 API
│   │       ├── session.ts            # 会话 API
│   │       ├── config.ts             # 配置 API
│   │       ├── tools.ts              # 工具 API
│   │       ├── skills.ts             # 技能 API
│   │       ├── mcp.ts                # MCP API
│   │       ├── channels.ts           # 通道 API
│   │       ├── automation.ts         # 自动化 API
│   │       ├── approval.ts           # 审批 API
│   │       ├── logs.ts               # 日志 API
│   │       ├── health.ts             # 健康检查
│   │       └── plugins.ts            # 插件 API
│   ├── hooks/                        # 钩子系统
│   │   └── hook-system.ts            # 钩子管理器
│   ├── mcp/                          # MCP 协议
│   │   ├── client.ts                 # MCP 客户端
│   │   ├── manager.ts                # 客户端管理器
│   │   ├── stdio-transport.ts        # StdIO 传输
│   │   ├── http-transport.ts         # HTTP 传输
│   │   ├── watcher.ts                # 配置热重载
│   │   └── types.ts                  # 类型定义
│   ├── memory/                       # 记忆系统
│   │   ├── memory-manager.ts         # 记忆管理器
│   │   ├── short-term.ts             # 短期记忆
│   │   ├── long-term.ts              # 长期记忆
│   │   └── compactor.ts              # 上下文压缩器
│   ├── plugins/                      # 插件系统
│   │   ├── registry.ts               # 插件注册表
│   │   ├── sdk.ts                    # 插件 SDK
│   │   └── types.ts                  # 插件类型
│   ├── security/                     # 安全系统
│   │   ├── approval.ts               # 操作审批
│   │   └── sandbox.ts                # VM 沙箱
│   ├── skills/                       # 技能系统
│   │   ├── manager.ts                # 技能管理器
│   │   ├── hub.ts                    # 技能市场
│   │   ├── scanner.ts                # 安全扫描
│   │   ├── builtins.ts               # 内置技能
│   │   └── types.ts                  # 技能类型
│   ├── soul/                         # 灵魂系统
│   │   ├── prompt-builder.ts         # 提示词构建器
│   │   └── soul-loader.ts            # 灵魂加载器
│   ├── tools/                        # 工具系统
│   │   ├── base.ts                   # 工具基类
│   │   ├── tool-registry.ts          # 工具注册表
│   │   └── impl/                     # 工具实现
│   │       ├── bash-tool.ts          # Bash 终端
│   │       ├── file-tools.ts         # 文件操作
│   │       ├── browser-tools.ts      # 浏览器自动化
│   │       ├── network-tools.ts      # 网络请求
│   │       ├── git-tool.ts           # Git 操作
│   │       ├── code-tools.ts         # 代码分析
│   │       └── audit-tool.ts         # 审计查询
│   ├── utils/                        # 工具函数
│   │   ├── logger.ts                 # 日志工具
│   │   ├── retry.ts                  # 重试策略
│   │   ├── fs.ts                     # 文件系统工具
│   │   └── platform.ts              # 平台检测
│   ├── app.ts                        # 应用主类
│   ├── entry.ts                      # 入口文件
│   └── index.ts                      # 导出入口
├── web/                              # Web 管理界面
│   ├── src/
│   │   ├── app/                      # Next.js App Router
│   │   ├── components/               # UI 组件
│   │   │   ├── layout/               # 布局组件
│   │   │   ├── ui/                   # 基础组件 (shadcn)
│   │   │   └── views/                # 页面视图
│   │   └── lib/                      # 工具库
│   │       ├── api-client.ts         # HTTP 客户端
│   │       ├── ws-client.ts          # WebSocket 客户端
│   │       ├── store.ts              # 状态管理 (Zustand)
│   │       └── i18n/                 # 国际化
│   ├── package.json
│   └── next.config.ts
├── project-overview/                 # 项目文档
│   └── Web/
│       ├── Web网关应用文档.md
│       └── Lotte功能与配置使用指南.md
├── picture/                          # 项目图片
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── tsdown.config.ts
├── vitest.config.ts
├── eslint.config.js
└── .prettierrc.json
```

---

## 快速开始

### 环境要求

- **Node.js** >= 22.0.0
- **pnpm**（推荐最新版本）
- **操作系统**：Windows 10+ / macOS / Linux

### 安装步骤

1. **克隆项目**

```bash
git clone <repository-url>
cd lotte-agent
```

2. **安装依赖**

```bash
# 安装后端依赖
pnpm install

# 安装前端依赖
cd web
pnpm install
cd ..
```

3. **初始化配置**

首次启动时，Lotte 会自动在 `~/.lotte/` 目录下生成默认配置文件。你也可以手动创建：

```bash
# 配置目录结构
~/.lotte/
├── config/           # 配置文件目录
│   ├── lotte.json    # 主配置
│   ├── ai.json       # AI 模型配置
│   ├── gateway.json  # 网关配置
│   ├── channels.json # 通道配置
│   ├── mcp.json      # MCP 配置
│   ├── skills.json   # 技能配置
│   ├── tools.json    # 工具配置
│   ├── automation.json # 自动化配置
│   ├── notification.json # 通知配置
│   ├── rag.json      # RAG 配置
│   └── multimodal.json # 多模态配置
├── data/             # 数据目录
│   ├── lotte.db      # SQLite 数据库
│   └── media/        # 媒体文件
├── soul/             # 灵魂目录
│   ├── SOUL.md       # 核心身份
│   ├── PROFILE.md    # 智能体档案
│   └── AGENTS.md     # 工作指南
├── memory/           # 记忆目录
│   └── MEMORY.md     # 长期记忆
├── logs/             # 日志目录
└── dumps/            # 错误转储目录
```

4. **配置 AI 模型**

编辑 `~/.lotte/config/ai.json`，填入你的 API Key：

```json
{
  "default_provider": "openai",
  "default_model": "gpt-4o",
  "providers": {
    "openai": {
      "api_url": "https://api.openai.com/v1",
      "api_key": "sk-your-api-key-here",
      "models": {
        "gpt-4o": {
          "context_window": 128000,
          "max_output": 16384
        }
      }
    }
  }
}
```

5. **启动服务**

```bash
# 开发模式（后端热重载）
pnpm dev

# 或构建后运行
pnpm build
pnpm start
```

6. **启动 Web 管理界面**

```bash
cd web
pnpm dev
```

访问 http://localhost:3000 打开管理界面。

---

## 配置说明

Lotte 采用 JSON 格式的分文件配置管理，所有配置文件位于 `~/.lotte/config/` 目录下，支持热更新。

### 主配置 (lotte.json)

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `app_name` | string | `"lotte"` | 应用名称 |
| `version` | string | `"1.0.0"` | 版本号 |
| `data_dir` | string | `""` | 数据目录（空则使用默认） |
| `log_level` | enum | `"info"` | 日志级别：debug/info/warn/error |
| `language` | string | `"zh-CN"` | 语言设置 |
| `modules` | object | - | 模块启用开关 |

### AI 模型配置 (ai.json)

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `default_provider` | string | `"openai"` | 默认模型提供者 |
| `default_model` | string | `"gpt-4o"` | 默认模型 |
| `stt.provider_type` | enum | `"disabled"` | 语音识别模式：disabled/local_whisper/whisper_api |
| `providers` | object | - | 模型提供者配置（支持 openai/anthropic/custom） |
| `model_aliases` | object | - | 模型别名映射 |

### 网关配置 (gateway.json)

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `host` | string | `"127.0.0.1"` | 监听地址 |
| `port` | number | `10623` | 监听端口 |
| `auth.mode` | enum | `"none"` | 认证模式：token/password/none |
| `auth.token` | string | `""` | 认证令牌 |
| `websocket.max_connections` | number | `10` | 最大 WebSocket 连接数 |
| `websocket.heartbeat_interval` | number | `30000` | 心跳间隔（毫秒） |

### 通道配置 (channels.json)

| 通道 | 字段 | 说明 |
|------|------|------|
| 微信 | `enabled`, `bot_token`, `base_url`, `bot_prefix`, `dm_policy`, `group_policy` | iLink Bot 接入 |
| QQ | `enabled`, `app_id`, `client_secret`, `bot_prefix`, `markdown_enabled` | 官方 Bot API |
| 飞书 | `enabled`, `app_id`, `app_secret`, `encrypt_key`, `verification_token`, `domain` | 官方 API |

### MCP 配置 (mcp.json)

```json
{
  "clients": {
    "client_name": {
      "name": "显示名称",
      "description": "描述",
      "enabled": true,
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "some-mcp-server@latest"],
      "env": { "API_KEY": "" }
    }
  }
}
```

支持的传输协议：`stdio`、`streamable_http`、`sse`

### 工具配置 (tools.json)

| 工具类别 | 可配置项 |
|---------|---------|
| bash | enabled, require_approval, timeout |
| file | enabled, require_approval, allowed_paths |
| browser | enabled, require_approval, headless |
| network | enabled, require_approval, allowed_domains |
| git | enabled, require_approval |
| sandbox | enabled, timeout, max_memory |

### 自动化配置 (automation.json)

| 模块 | 说明 |
|------|------|
| cron | Cron 定时任务调度 |
| workflow | 工作流编排引擎 |
| trigger | 事件触发规则 |

### 环境变量

| 变量 | 说明 |
|------|------|
| `LOTTE_STATE_DIR` | 自定义状态目录路径（默认 `~/.lotte/`） |

---

## 功能模块

### Agent 核心引擎

Lotte 采用 ReAct (Reasoning + Acting) 推理模式，核心流程如下：

```
用户消息 → PromptBuilder（组装系统提示）→ ReAct 循环
  → LLM 推理 → 工具调用决策
    → 工具策略管道（审批/沙箱/权限检查）
      → 工具执行 → 结果返回
  → 继续推理或生成回复
→ 记忆更新（短期+长期）→ 回复用户
```

**关键特性**：
- 支持多轮工具调用（最多 25 轮）
- 工具策略管道：权限检查 → 审批控制 → 沙箱隔离 → 工具执行
- 会话管理：多会话并行、上下文记忆、历史回放

### 记忆系统

采用分层记忆架构：

| 层级 | 实现 | 说明 |
|------|------|------|
| 短期记忆 | InMemoryMemory | 当前会话消息列表，支持压缩摘要 |
| 长期记忆 | MEMORY.md + memory/*.md | 持久化存储，向量搜索检索 |
| 压缩机制 | ContextCompactor | 上下文接近上限时自动压缩 |

### 灵魂系统

通过 Markdown 文件定义智能体人格：

| 文件 | 说明 |
|------|------|
| `SOUL.md` | 核心身份和行为原则 |
| `PROFILE.md` | 智能体名称、角色、用户档案 |
| `AGENTS.md` | 详细工作流、规则和操作指南 |

`PromptBuilder` 将这些文件组装为系统提示词注入 LLM，用户可自定义修改来改变智能体人格。

### MCP 协议

- **客户端管理器**：管理 MCP 客户端生命周期，支持热替换
- **三种传输协议**：stdio（本地进程）、streamable_http（HTTP 流式）、sse（Server-Sent Events）
- **配置热重载**：监视配置文件变更，增量重载客户端
- **故障恢复**：客户端损坏时自动重连或重建

### 技能系统

- **SKILL.md 定义**：每个技能通过 SKILL.md（含 YAML frontmatter）定义
- **技能池**：共享技能池，支持工作区与池之间的技能传输
- **技能市场**：支持从 Hub 搜索和安装技能
- **安全扫描**：安装前扫描技能安全性（命令注入、提示注入等）

### 插件系统

```typescript
type LottePluginDefinition = {
  id: string;
  name: string;
  description?: string;
  version?: string;
  configSchema?: object;
  register?: (api: LottePluginApi) => void;
  activate?: (api: LottePluginApi) => void;
  deactivate?: () => void;
};
```

插件生命周期：发现 → 加载 → 注册 → 激活 → 运行 → 停用

### 安全系统

- **操作审批**：敏感操作（如 Bash 执行、浏览器操作）需用户确认
- **VM 沙箱**：隔离执行环境，限制资源使用
- **审计日志**：全链路操作记录，支持查询和统计
- **工具策略管道**：可配置的权限检查和审批控制规则

---

## API 接口

### 基础信息

- **基础路径**：`http://127.0.0.1:10623/api/v1`
- **认证方式**：Bearer Token 或 Password，通过 `Authorization` 头传递

### OpenAI 兼容接口

| 路径 | 方法 | 说明 |
|------|------|------|
| `/v1/chat/completions` | POST | OpenAI 兼容的对话接口 |

### 核心 API

| 路径 | 方法 | 说明 |
|------|------|------|
| `/api/v1/chat` | POST | 发送对话消息 |
| `/api/v1/sessions` | GET | 列出会话 |
| `/api/v1/sessions` | POST | 创建会话 |
| `/api/v1/sessions/:id` | DELETE | 删除会话 |
| `/api/v1/config` | GET | 获取配置 |
| `/api/v1/config` | PUT | 更新配置 |
| `/api/v1/tools` | GET | 工具目录 |
| `/api/v1/tools/invoke` | POST | 调用工具 |
| `/api/v1/skills` | GET | 技能列表 |
| `/api/v1/skills/install` | POST | 安装技能 |
| `/api/v1/mcp` | GET | MCP 客户端列表 |
| `/api/v1/mcp` | POST | 添加 MCP 客户端 |
| `/api/v1/channels/status` | GET | 通道状态 |
| `/api/v1/approval/pending` | GET | 待审批列表 |
| `/api/v1/approval/resolve` | POST | 审批操作 |
| `/api/v1/automation/cron` | GET | 定时任务列表 |
| `/api/v1/automation/cron` | POST | 添加定时任务 |
| `/api/v1/logs` | GET | 日志查询 |
| `/api/v1/health` | GET | 健康检查 |

### WebSocket RPC

WebSocket 连接地址：`ws://127.0.0.1:10623/ws`

**通信协议**：基于帧的 RPC 协议

| 帧类型 | 说明 |
|--------|------|
| RequestFrame | 请求帧（type: "req"） |
| ResponseFrame | 响应帧（type: "res"） |
| EventFrame | 事件帧（type: "event"） |

**RPC 方法**：`connect`、`chat.send`、`chat.abort`、`sessions.list`、`sessions.create`、`config.get`、`config.set`、`tools.catalog`、`tools.invoke`、`skills.list`、`mcp.list`、`channels.status`、`approval.pending`、`approval.resolve`、`cron.list`、`cron.add`、`logs.tail` 等

**事件类型**：`tick`（心跳）、`agent.message`、`agent.done`、`agent.error`、`approval.request`、`config.changed`、`channel.status`、`shutdown`

---

## Web 管理界面

Lotte 提供基于 React + Next.js 的 Web 管理界面，包含以下功能视图：

| 视图 | 功能 |
|------|------|
| Chat | 智能体对话交互 |
| Sessions | 会话管理 |
| Skills | 技能管理（安装/启用/禁用） |
| MCP | MCP 客户端管理 |
| Channels | 消息通道状态监控 |
| Automation | 定时任务/工作流/触发器管理 |
| Logs | 实时日志查看 |
| Config | 系统配置管理 |
| RAG | 文档上传与检索管理 |

---

## 插件开发

### 插件目录结构

```
plugins/
└── my-plugin/
    ├── index.ts          # 插件入口
    ├── package.json      # 插件元数据
    └── README.md         # 插件文档
```

### 插件 API

```typescript
type LottePluginApi = {
  registerTool(tool)              // 注册工具
  registerHook(event, handler)    // 注册生命周期钩子
  registerHttpRoute(params)       // 注册 HTTP 路由
  registerChannel(registration)   // 注册消息通道
  registerGatewayMethod(method)   // 注册 Gateway RPC 方法
  registerProvider(provider)      // 注册模型 Provider
  registerCommand(command)        // 注册 CLI 命令
  on(hookName, handler)           // 注册生命周期钩子（链式）
};
```

### 生命周期钩子

| 钩子名 | 说明 |
|--------|------|
| `before-agent-start` | 智能体启动前 |
| `before-tool-call` | 工具调用前 |
| `after-tool-call` | 工具调用后 |
| `before-agent-reply` | 智能体回复前 |
| `reply-dispatch` | 回复分发 |

---

## 开发指南

### 常用命令

```bash
# 开发模式（后端热重载）
pnpm dev

# 构建项目
pnpm build

# 生产模式运行
pnpm start

# 运行测试
pnpm test

# 监听模式测试
pnpm test:watch

# 代码检查
pnpm lint

# 代码格式化
pnpm format

# 格式化检查
pnpm format:check

# 类型检查
pnpm typecheck

# Web 前端开发
cd web
pnpm dev      # 开发模式
pnpm build    # 构建
pnpm start    # 生产模式
```

### 数据库

- **引擎**：SQLite (better-sqlite3)
- **文件位置**：`~/.lotte/data/lotte.db`
- **模式**：WAL（Write-Ahead Logging）
- **向量扩展**：sqlite-vec
- **迁移策略**：基于 `PRAGMA table_info()` 的增量 ALTER TABLE 迁移

### 错误处理

Lotte 采用五层错误处理体系：

| 层级 | 策略 |
|------|------|
| Gateway 中间件层 | 捕获未处理异常，返回统一错误响应 |
| 通道消费层 | 日志 + 发送错误提示到通道 |
| Agent 执行层 | 增强异常 + 调试转储 + re-raise |
| 队列消费层 | 日志 + 清理状态，不传播异常 |
| 工具执行层 | 捕获异常，返回工具错误结果 |

---

## 参考项目

Lotte 的开发参考了以下开源项目：

| 项目 | 路径 | 参考内容 |
|------|------|---------|
| [OpenClaw](https://github.com/openclaw) | `D:\Trae项目\openclaw-main` | Agent 架构、Shell/Git Bash 工具、Web 网关架构、多模态、MCP 协议 |
| [CoPaw](https://github.com/copaw) | `D:\Trae项目\CoPaw-main` | 多渠道接入、MCP/Skill/人格系统、Web UI 设计、记忆系统 |

---

## 许可证

[MIT License](LICENSE)
