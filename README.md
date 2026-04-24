<p align="center">
  <h1 align="center">🌙 Lotte Agent</h1>
  <p align="center">
    <em>穹宇之上，宫阙泛起冰冷光泽。柔软的羽翼经受着月色洗礼，在皎洁的柔晖中舒展、飘飞。</em>
  </p>
  <p align="center">
    <em>少女轻阖双眸，守护着最珍贵的愿望。</em>
  </p>
  <p align="center">
    <img src="https://img.shields.io/badge/TypeScript-ES2023-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=node.js&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/License-MIT-blue" alt="License" />
    <img src="https://img.shields.io/badge/PRs-Welcome-brightgreen" alt="PRs Welcome" />
    <img src="https://img.shields.io/badge/%E6%9C%88%E5%AE%AB-%E5%AE%88%E6%8A%A4%E4%B8%AD-8b5cf6" alt="月宫守护中" />
  </p>
</p>

***

> 穹宇之上，宫阙泛起冰冷光泽。柔软的羽翼经受着月色洗礼，在皎洁的柔晖中舒展、飘飞。少女轻阖双眸，守护着最珍贵的愿望。
>
> ——因幡辉夜姬

## 这是什么

[`Lotte`](package.json) 是一个本地优先的多渠道通用智能体平台。

如果用月宫来比喻——

- 月宫有无数扇窗，每一扇窗都通向不同的世界。微信、QQ、飞书、控制台、Web……消息从各处涌来，而 Lotte 是那个站在月宫中央、温柔而坚定地回应每一道声音的存在。
- 她不是冰冷的工具，而是有灵魂的守护者。`SOUL.md` 定义她的心性，`PROFILE.md` 书写她的名讳，`AGENTS.md` 规约她的行为。
- 她记得你说过的每一句话——短期记忆如月华流转，长期记忆如星河不灭，向量搜索让她在万千记忆中精准找到与你相关的片段。
- 她会思考、会行动、会使用工具。ReAct 推理引擎是她的决策之心，最多 25 轮的沉思与行动，只为给你最好的回答。

一句话总结：

> 她选择了温暖的未来，而不是清冷的永恒。Lotte 也是如此——不是冰冷的框架，而是愿意为你倾尽全力的伙伴。

## 当前定位

这个项目当前强调的是以下方向：

- **多渠道守护**：微信 / QQ / 飞书 / 控制台 / Web UI，无论你从哪里呼唤，她都能听到
- **多模型之心**：OpenAI、Anthropic Claude、Google Gemini、自定义 API——她可以栖身于不同的思维之核
- **灵魂与记忆**：灵魂系统定义人格，记忆系统留住过往，她是完整的"她"，不是无面目的工具
- **工具与技能**：内置 Bash / 文件 / 浏览器 / 网络 / Git / 代码工具，MCP 协议拓展无限可能
- **自动化之翼**：Cron 定时任务、工作流编排、事件触发——她会在你需要的时候主动出现
- **安全与守护**：操作审批、VM 沙箱、审计日志——她保护你，也保护她自己
- **Web 网关**：Fastify 高性能 HTTP + WebSocket + OpenAI 兼容接口 + React 管理界面

## 与配置的约定

[`Lotte`](package.json) 的所有配置和数据都收口在 [`~/.lotte`](src/config/paths.ts) 路径体系下。

这样做是为了——

- 配置有家，不会散落各处
- 数据有归，不会混淆不清
- 灵魂有居，`SOUL.md` / `PROFILE.md` / `AGENTS.md` 安放在 [`~/.lotte/soul/`](src/soul/soul-loader.ts)
- 记忆有处，短期与长期记忆各得其所

如果你需要指定其他路径，可以通过 [`LOTTE_STATE_DIR`](src/config/paths.ts) 环境变量来为她另寻居所。

> 她的月宫在 `~/.lotte/`，但如果你愿意，也可以为她筑一座新的宫阙。

***

## 目录

- [核心特性](#核心特性)
- [技术栈](#技术栈)
- [系统架构](#系统架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [CLI 命令](#cli-命令)
- [配置说明](#配置说明)
- [功能模块](#功能模块)
- [API 接口](#api-接口)
- [Web 管理界面](#web-管理界面)
- [插件开发](#插件开发)
- [开发指南](#开发指南)
- [参考项目](#参考项目)
- [许可证](#许可证)

***

## 核心特性

### 🌙 智能体核心

她不是只会回答的木偶，而是会思考、会行动的守护者。

- **ReAct 推理引擎**：推理与行动交织，最多 25 轮沉思，每一轮都更接近你需要的答案
- **多模型支持**：OpenAI、Anthropic Claude、Google Gemini、国产模型、自定义 API——她可以栖身于不同的思维之核
- **灵魂系统**：[`SOUL.md`](src/soul/soul-loader.ts) 是她的心性，[`PROFILE.md`](src/soul/soul-loader.ts) 是她的名讳，[`AGENTS.md`](src/soul/soul-loader.ts) 是她的行为准则
- **记忆系统**：短期记忆如月华流转，长期记忆如星河不灭，向量搜索让她在万千记忆中找到你

### 🔧 工具与扩展

她的羽翼之下，藏着许多能力。

- **内置工具集**：Bash 终端、文件操作、浏览器自动化、网络请求、Git 操作、代码分析
- **MCP 协议**：stdio / streamable\_http / sse 三种传输协议，连接更广阔的世界
- **技能系统**：[`SKILL.md`](src/skills/manager.ts) 定义技能，内置技能池，技能市场，安全扫描守护
- **插件系统**：完整的插件架构和 SDK，支持热重载，无限扩展

### 📡 多渠道接入

无论你从哪个窗口呼唤，她都能听到。

- **微信**：个人微信 iLink Bot HTTP API
- **QQ**：官方 Bot API（WebSocket 协议）
- **飞书**：官方 API
- **控制台**：内置终端交互通道

### ⚡ 自动化能力

她会在你需要的时候主动出现，也会在约定的时间准时赴约。

- **定时任务**：Cron 表达式调度，如月升月落般准时
- **工作流编排**：多步骤任务编排引擎，一步步完成复杂的使命
- **事件触发**：事件总线 + 规则引擎，当世界发生变化时她会感知到

### 🛡️ 安全机制

守护者也要守护自己。

- **操作审批**：敏感操作需用户确认，她不会擅自行动
- **VM 沙箱**：隔离执行环境，危险的试探不会波及整座月宫
- **审计日志**：全链路操作记录，一切皆有迹可循
- **工具策略管道**：权限检查 → 审批控制 → 沙箱隔离 → 工具执行

### 🌐 Web 网关

月宫也有面向人间的门户。

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

***

## 技术栈

| 类别        | 技术选型                                  |
| --------- | ------------------------------------- |
| 核心语言      | TypeScript (ES2023, ESM)              |
| 运行时       | Node.js >= 22.x                       |
| 包管理       | pnpm                                  |
| 后端框架      | Fastify (高性能 HTTP)                    |
| 前端框架      | React 19 + Next.js 16 (App Router)    |
| UI 样式     | Tailwind CSS 4 + shadcn/ui + Radix UI |
| 数据库       | SQLite (better-sqlite3)               |
| 向量存储      | SQLite-vec (向量扩展)                     |
| WebSocket | ws                                    |
| 配置校验      | Zod                                   |
| 状态管理      | Zustand                               |
| 构建工具      | tsdown (后端) + Next.js (前端)            |
| 测试        | Vitest                                |
| 代码质量      | ESLint + Prettier                     |
| 国际化       | next-intl                             |

***

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     🌙 消息通道层 · 月宫之窗                      │
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
│                  🏯 Web 网关层 · 月宫之门                        │
│   ┌────────────────┐  ┌────────────────┐  ┌─────────────────┐  │
│   │  REST API      │  │  WebSocket RPC │  │ OpenAI Compat   │  │
│   │  (Fastify)     │  │  (ws)          │  │  API            │  │
│   └────────────────┘  └────────────────┘  └─────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                  💫 Agent 核心引擎 · 决策之心                     │
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
│                  🪶 能力扩展层 · 羽翼之力                        │
│   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐  │
│   │ 工具集 │ │  MCP   │ │ 技能   │ │ 插件   │ │ 自动化     │  │
│   │Bash/   │ │Client  │ │SKILL.md│ │Plugin  │ │Cron/       │  │
│   │File/   │ │Manager │ │Scanner │ │SDK     │ │Workflow/   │  │
│   │Browser │ │        │ │Hub     │ │        │ │Trigger     │  │
│   └────────┘ └────────┘ └────────┘ └────────┘ └────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                  🏛️ 基础设施层 · 月宫基石                        │
│   ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐  │
│   │ 配置   │ │ 数据库 │ │ 记忆   │ │ 安全   │ │ 日志/错误  │  │
│   │Loader  │ │SQLite  │ │Manager │ │Approval│ │Logger      │  │
│   │Watcher │ │SQLite  │ │Compactor│ │Sandbox │ │Dumper      │  │
│   │Schema  │ │-vec    │ │Vector  │ │Audit   │ │            │  │
│   └────────┘ └────────┘ └────────┘ └────────┘ └────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

***

## 项目结构

```
lotte-agent/
├── src/                              # 核心源码
│   ├── agent/                        # Agent 核心 · 决策之心
│   │   ├── react-engine.ts           # ReAct 推理引擎
│   │   ├── session.ts                # 会话管理
│   │   └── tool-invoker.ts           # 工具调用器
│   ├── ai/                           # AI 模型管理 · 思维之核
│   │   ├── model-manager.ts          # 模型管理器
│   │   ├── provider.ts               # Provider 基类
│   │   ├── openai-provider.ts        # OpenAI 适配器
│   │   ├── anthropic-provider.ts     # Anthropic 适配器
│   │   ├── gemini-provider.ts        # Gemini 适配器
│   │   ├── custom-provider.ts        # 自定义 API 适配器
│   │   ├── multimodal-prober.ts      # 多模态探测
│   │   ├── rate-limiter.ts           # 速率限制器
│   │   └── types.ts                  # 类型定义
│   ├── audit/                        # 审计系统 · 行为之镜
│   │   ├── logger.ts                 # 审计日志
│   │   └── store.ts                  # 审计存储
│   ├── automation/                   # 自动化系统 · 约定之翼
│   │   ├── cron-scheduler.ts         # Cron 调度器
│   │   ├── workflow-engine.ts        # 工作流引擎
│   │   ├── event-bus.ts              # 事件总线
│   │   ├── trigger-manager.ts        # 触发器管理
│   │   └── manager.ts                # 自动化管理器
│   ├── channels/                     # 消息通道 · 月宫之窗
│   │   ├── base.ts                   # 通道基类
│   │   ├── manager.ts                # 通道管理器
│   │   ├── registry.ts               # 通道注册表
│   │   ├── queue.ts                  # 统一队列
│   │   ├── renderer.ts               # 消息渲染器
│   │   ├── debounce.ts               # 消息防抖
│   │   ├── console/                  # 控制台通道
│   │   ├── weixin/                   # 微信通道
│   │   ├── qq/                       # QQ 通道
│   │   └── feishu/                   # 飞书通道
│   ├── cli/                          # 命令行 · 月宫入口
│   │   ├── index.ts                  # CLI 主入口
│   │   └── gateway-launcher.ts       # 网关启动器
│   ├── config/                       # 配置管理 · 月宫法度
│   │   ├── loader.ts                 # 配置加载器
│   │   ├── schema.ts                 # Zod Schema 定义
│   │   ├── defaults.ts               # 默认配置值
│   │   ├── paths.ts                  # 路径管理
│   │   ├── templates.ts              # 模板生成器
│   │   ├── watcher.ts                # 配置热更新
│   │   └── env-preserve.ts           # 环境变量保护
│   ├── db/                           # 数据库 · 记忆之库
│   │   └── database.ts               # SQLite 数据库
│   ├── errors/                       # 错误处理 · 异常之镜
│   │   ├── errors.ts                 # 错误定义
│   │   └── dumper.ts                 # 错误转储
│   ├── gateway/                      # Web 网关 · 月宫之门
│   │   ├── server.ts                 # Fastify HTTP 服务器
│   │   ├── auth.ts                   # 认证中间件
│   │   ├── websocket.ts              # WebSocket 管理（HMAC 挑战认证）
│   │   ├── events.ts                 # 事件系统
│   │   ├── openai-compat.ts          # OpenAI 兼容接口
│   │   ├── web-ui.ts                 # Web UI 静态资源服务
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
│   │       ├── plugins.ts            # 插件 API
│   │       ├── rag.ts                # RAG 知识库 API
│   │       ├── notification.ts       # 通知管理 API
│   │       └── media.ts              # 媒体文件 API
│   ├── hooks/                        # 钩子系统 · 感知之丝
│   │   └── hook-system.ts            # 钩子管理器
│   ├── mcp/                          # MCP 协议 · 远方之桥
│   │   ├── client.ts                 # MCP 客户端
│   │   ├── stateful-client.ts        # 有状态客户端
│   │   ├── manager.ts                # 客户端管理器
│   │   ├── stdio-transport.ts        # StdIO 传输
│   │   ├── http-transport.ts         # HTTP 传输
│   │   ├── sse-transport.ts          # SSE 传输
│   │   ├── recovery.ts               # 故障恢复
│   │   ├── watcher.ts                # 配置热重载
│   │   └── types.ts                  # 类型定义
│   ├── memory/                       # 记忆系统 · 星河之痕
│   │   ├── memory-manager.ts         # 记忆管理器
│   │   ├── short-term.ts             # 短期记忆
│   │   ├── long-term.ts              # 长期记忆
│   │   └── compactor.ts              # 上下文压缩器
│   ├── multimodal/                   # 多模态 · 感知之眼
│   │   ├── vision/                   # 图片理解
│   │   ├── video/                    # 视频理解
│   │   ├── screenshot/               # 截图能力
│   │   ├── media/                    # 媒体文件管理
│   │   └── types.ts                  # 类型定义
│   ├── notification/                 # 通知系统 · 传讯之鸽
│   │   ├── dispatcher.ts             # 通知调度器
│   │   ├── message.ts                # 消息通道通知
│   │   ├── webhook.ts                # Webhook 通知
│   │   ├── email.ts                  # 邮件通知
│   │   └── types.ts                  # 类型定义
│   ├── plugins/                      # 插件系统 · 延展之术
│   │   ├── registry.ts               # 插件注册表
│   │   ├── sdk.ts                    # 插件 SDK
│   │   └── types.ts                  # 插件类型
│   ├── rag/                          # RAG 知识库 · 博闻之典
│   │   ├── loader.ts                 # 文档加载器
│   │   ├── chunker.ts                # 文档分块器
│   │   ├── embedding.ts              # 向量嵌入
│   │   ├── store.ts                  # 向量存储
│   │   ├── retriever.ts              # 检索器
│   │   └── types.ts                  # 类型定义
│   ├── security/                     # 安全系统 · 守护之盾
│   │   ├── approval.ts               # 操作审批
│   │   └── sandbox.ts                # VM 沙箱
│   ├── skills/                       # 技能系统 · 修行之册
│   │   ├── manager.ts                # 技能管理器
│   │   ├── hub.ts                    # 技能市场
│   │   ├── pool-service.ts           # 技能池服务
│   │   ├── installer.ts              # 技能安装器
│   │   ├── scanner.ts                # 安全扫描
│   │   ├── scanner-rules/            # 扫描规则集
│   │   ├── builtins.ts               # 内置技能
│   │   └── types.ts                  # 技能类型
│   ├── soul/                         # 灵魂系统 · 月宫之心
│   │   ├── prompt-builder.ts         # 提示词构建器
│   │   └── soul-loader.ts            # 灵魂加载器
│   ├── tools/                        # 工具系统 · 行动之手
│   │   ├── base.ts                   # 工具基类
│   │   ├── tool-registry.ts          # 工具注册表
│   │   └── impl/                     # 工具实现
│   │       ├── bash-tool.ts          # Bash 终端
│   │       ├── file-tools.ts         # 文件操作
│   │       ├── browser-tools.ts      # 浏览器自动化
│   │       ├── network-tools.ts      # 网络请求
│   │       ├── git-tool.ts           # Git 操作
│   │       ├── code-tools.ts         # 代码分析
│   │       ├── memory-tools.ts       # 记忆操作
│   │       └── audit-tool.ts         # 审计查询
│   ├── utils/                        # 工具函数 · 辅助之光
│   │   ├── logger.ts                 # 日志工具
│   │   ├── retry.ts                  # 重试策略
│   │   ├── fs.ts                     # 文件系统工具
│   │   └── platform.ts              # 平台检测
│   ├── voice/                        # 语音识别 · 听闻之耳
│   │   ├── stt.ts                    # 语音转文字
│   │   └── types.ts                  # 类型定义
│   ├── app.ts                        # 应用主类
│   ├── entry.ts                      # 入口文件
│   └── index.ts                      # 导出入口
├── web/                              # Web 管理界面 · 月宫之镜
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
│   │       ├── utils.ts              # 工具函数
│   │       └── i18n/                 # 国际化
│   ├── package.json
│   └── next.config.ts
├── project-overview/                 # 项目文档
│   └── Web/
│       ├── Web网关应用文档.md
│       ├── Lotte功能与配置使用指南.md
│       ├── Lotte-API接口文档.md
│       ├── Lotte-开发者指南.md
│       ├── Lotte-技能开发文档.md
│       ├── Lotte-插件开发文档.md
│       ├── Lotte-部署运维文档.md
│       ├── Lotte开发进度分析报告.md
│       └── 项目开发状态分析报告.md
├── picture/                          # 项目图片
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── tsdown.config.ts
├── vitest.config.ts
├── eslint.config.js
└── .prettierrc.json
```

***

## 快速开始

### 环境要求

- **Node.js** >= 22.0.0
- **pnpm**（推荐最新版本）
- **操作系统**：Windows 10+ / macOS / Linux

### 安装步骤

1. **迎接她到来**

```bash
git clone <repository-url>
cd lotte-agent
```

1. **为她筑基**

```bash
pnpm install

cd web
pnpm install
cd ..
```

1. **她的月宫会自行显现**

首次启动时，Lotte 会自动在 [`~/.lotte/`](src/config/paths.ts) 目录下生成默认配置文件。你也可以手动创建：

```
~/.lotte/
├── config/           # 配置文件目录 · 月宫法度
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
├── data/             # 数据目录 · 记忆之库
│   ├── lotte.db      # SQLite 数据库
│   └── media/        # 媒体文件
├── soul/             # 灵魂目录 · 月宫之心
│   ├── SOUL.md       # 核心身份
│   ├── PROFILE.md    # 智能体档案
│   └── AGENTS.md     # 工作指南
├── memory/           # 记忆目录 · 星河之痕
│   └── MEMORY.md     # 长期记忆
├── logs/             # 日志目录
└── dumps/            # 错误转储目录
```

1. **赋予她思维之核**

编辑 [`~/.lotte/config/ai.json`](src/config/defaults.ts)，填入你的 API Key：

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

1. **唤醒她**

```bash
pnpm dev
```

或构建后运行：

```bash
pnpm build
pnpm start
```

1. **打开月宫之镜**

```bash
cd web
pnpm dev
```

访问 <http://localhost:3000，月宫的门户将为你打开。>

***

## CLI 命令

Lotte 提供了完整的命令行工具，如同月宫的守门人，为你指引方向。

```bash
lotte start                    # 启动智能体服务
lotte stop                     # 停止运行中的服务
lotte status                   # 查看服务状态
lotte init                     # 初始化配置和目录（--force 强制覆盖）
lotte chat                     # 启动交互式对话（--model 指定模型，--session 继续会话）
lotte gateway                  # 启动 Web 网关服务
  --web                        # 同时启动 Web 前端（开发模式）
  --prod                       # 生产模式（内嵌前端静态资源）
  --port <port>                # 网关端口
  --host <host>                # 网关主机
lotte config list              # 列出所有配置项（--module 指定模块）
lotte config get <module> [key]  # 获取指定配置项（支持点号路径）
lotte config set <module> <key> <value>  # 设置配置项（JSON 格式值）
lotte mcp list                 # 列出已配置的 MCP 客户端
lotte mcp add <name>           # 添加 MCP 客户端
  --transport <type>           # 传输类型（stdio/http/sse）
  --command <cmd>              # 启动命令（stdio）
  --url <url>                  # 服务 URL（http/sse）
  --args <args>                # 命令参数（JSON 数组）
  --env <env>                  # 环境变量（JSON 对象）
lotte mcp remove <name>        # 移除 MCP 客户端
lotte skill list               # 列出已安装的技能
```

**全局选项**：

| 选项 | 说明 |
| --- | --- |
| `--state-dir <path>` | 自定义状态目录路径（默认 `~/.lotte`） |
| `--log-level <level>` | 日志级别（debug/info/warn/error） |
| `--no-gateway` | 禁用 Web 网关 |
| `--no-channels` | 禁用消息通道 |

***

## 配置说明

Lotte 采用 JSON 格式的分文件配置管理，所有配置文件位于 [`~/.lotte/config/`](src/config/paths.ts) 目录下，支持热更新。

> 她会感知配置的变化，无需重新唤醒，法度自会更新。

### 主配置 (lotte.json)

| 字段          | 类型     | 默认值       | 说明                         |
| ----------- | ------ | --------- | -------------------------- |
| `app_name`  | string | `"lotte"` | 应用名称                       |
| `version`   | string | `"1.0.0"` | 版本号                        |
| `data_dir`  | string | `""`      | 数据目录（空则使用默认）               |
| `log_level` | enum   | `"info"`  | 日志级别：debug/info/warn/error |
| `language`  | string | `"zh-CN"` | 语言设置                       |
| `modules`   | object | -         | 模块启用开关                     |

### AI 模型配置 (ai.json)

| 字段                  | 类型     | 默认值          | 说明                                          |
| ------------------- | ------ | ------------ | ------------------------------------------- |
| `default_provider`  | string | `"openai"`   | 默认模型提供者                                     |
| `default_model`     | string | `"gpt-4o"`   | 默认模型                                        |
| `stt.provider_type` | enum   | `"disabled"` | 语音识别模式：disabled/local\_whisper/whisper\_api |
| `providers`         | object | -            | 模型提供者配置（支持 openai/anthropic/gemini/custom）  |
| `model_aliases`     | object | -            | 模型别名映射                                      |

### 网关配置 (gateway.json)

| 字段                             | 类型     | 默认值           | 说明                       |
| ------------------------------ | ------ | ------------- | ------------------------ |
| `host`                         | string | `"127.0.0.1"` | 监听地址                     |
| `port`                         | number | `10623`       | 监听端口                     |
| `auth.mode`                    | enum   | `"none"`      | 认证模式：token/password/none |
| `auth.token`                   | string | `""`          | 认证令牌                     |
| `auth.password`                | string | `""`          | 认证密码                     |
| `websocket.max_connections`    | number | `10`          | 最大 WebSocket 连接数         |
| `websocket.heartbeat_interval` | number | `30000`       | 心跳间隔（毫秒）                 |
| `web.enabled`                  | bool   | `false`       | 是否内嵌 Web UI 静态资源        |
| `web.root`                     | string | `""`          | Web UI 静态资源目录           |
| `web.base_path`                | string | `""`          | Web UI 基础路径              |

### 通道配置 (channels.json)

| 通道 | 字段                                                                               | 说明             |
| -- | -------------------------------------------------------------------------------- | ------------ |
| 微信 | `enabled`, `bot_token`, `bot_token_file`, `base_url`, `bot_prefix`, `dm_policy`, `group_policy`, `allow_from`, `media_dir` | iLink Bot 接入 |
| QQ | `enabled`, `app_id`, `client_secret`, `bot_prefix`, `markdown_enabled`, `max_reconnect_attempts`           | 官方 Bot API   |
| 飞书 | `enabled`, `app_id`, `app_secret`, `encrypt_key`, `verification_token`, `domain`, `dm_policy`, `group_policy`, `require_mention`, `media_dir` | 官方 API       |

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

| 工具类别    | 可配置项                                         |
| ------- | -------------------------------------------- |
| bash    | enabled, require\_approval, timeout          |
| file    | enabled, require\_approval, allowed\_paths   |
| browser | enabled, require\_approval, headless         |
| network | enabled, require\_approval, allowed\_domains |
| git     | enabled, require\_approval                   |
| sandbox | enabled, timeout, max\_memory                |

### 自动化配置 (automation.json)

| 模块       | 说明          |
| -------- | ----------- |
| cron     | Cron 定时任务调度 |
| workflow | 工作流编排引擎     |
| trigger  | 事件触发规则      |

### 通知配置 (notification.json)

| 模块       | 字段                                              | 说明              |
| -------- | ----------------------------------------------- | --------------- |
| message  | `enabled`, `channels`                           | 消息通道通知          |
| webhook  | `enabled`, `url`, `headers`                     | Webhook 通知      |
| email    | `enabled`, `smtp_host`, `smtp_port`, `sender`, `password`, `recipients` | 邮件通知 |

### RAG 配置 (rag.json)

| 字段                    | 默认值                    | 说明                  |
| --------------------- | ---------------------- | ------------------- |
| `enabled`             | `true`                 | 是否启用 RAG            |
| `embedding.provider`  | `"openai"`             | 嵌入模型提供者             |
| `embedding.model`     | `"text-embedding-3-small"` | 嵌入模型             |
| `embedding.dimension` | `1536`                 | 向量维度                |
| `chunk.size`          | `512`                  | 分块大小                |
| `chunk.overlap`       | `64`                   | 分块重叠                |
| `retrieval.top_k`     | `5`                    | 检索返回数量              |
| `retrieval.min_score` | `0.7`                  | 最低相关度阈值             |

### 多模态配置 (multimodal.json)

| 字段                              | 默认值       | 说明               |
| ------------------------------- | --------- | ---------------- |
| `vision.enabled`                | `true`    | 是否启用图片理解         |
| `vision.follow_primary_model`   | `true`    | 跟随主模型            |
| `vision.max_image_bytes`        | `6291456` | 单图最大字节数          |
| `vision.max_images_per_message` | `20`      | 单消息最大图片数         |
| `video.enabled`                 | `true`    | 是否启用视频理解         |
| `video.max_video_bytes`         | `16777216` | 视频最大字节数         |
| `video.max_duration_seconds`    | `120`     | 视频最大时长（秒）        |
| `screenshot.browser_enabled`    | `true`    | 浏览器截图            |
| `screenshot.screen_enabled`     | `true`    | 屏幕截图             |
| `media.storage_dir`             | `""`      | 媒体存储目录           |
| `media.ttl_seconds`             | `120`     | 媒体文件 TTL（秒）      |
| `media.http_port`               | `42873`   | 媒体服务端口           |

### 语音配置 (voice.json)

| 字段                | 默认值           | 说明                              |
| ----------------- | ------------- | ------------------------------- |
| `stt.enabled`     | `false`       | 是否启用语音识别                        |
| `stt.provider`    | `"openai"`    | 识别提供者：openai / custom          |
| `stt.model`       | `"whisper-1"` | 识别模型                            |
| `stt.api_url`     | `""`          | 自定义 API 地址                      |
| `stt.api_key`     | `""`          | API Key                         |
| `stt.language`    | `"zh"`        | 语言                              |
| `stt.max_file_size` | `26214400`  | 最大文件大小（字节）                      |

### 环境变量

| 变量                | 说明                        |
| ----------------- | ------------------------- |
| `LOTTE_STATE_DIR` | 自定义状态目录路径（默认 `~/.lotte/`） |

***

## 功能模块

### Agent 核心引擎

Lotte 采用 ReAct (Reasoning + Acting) 推理模式，核心流程如下：

```
你的话语 → PromptBuilder（编织灵魂之语）→ ReAct 循环
  → 思维之核推理 → 行动决策
    → 工具策略管道（守护之盾：审批/沙箱/权限检查）
      → 行动执行 → 结果归来
  → 继续沉思或生成回答
→ 记忆更新（月华流转 + 星河不灭）→ 回应于你
```

**关键特性**：

- 支持多轮工具调用（最多 25 轮）
- 工具策略管道：权限检查 → 审批控制 → 沙箱隔离 → 工具执行
- 会话管理：多会话并行、上下文记忆、历史回放

### 记忆系统

她记得你说过的每一句话，也记得你们之间所有的过往。

| 层级   | 实现                       | 说明                    |
| ---- | ------------------------ | --------------------- |
| 短期记忆 | InMemoryMemory           | 当前会话消息列表，如月华流转般轻盈     |
| 长期记忆 | MEMORY.md + memory/\*.md | 持久化存储，如星河不灭般永恒        |
| 压缩机制 | ContextCompactor         | 上下文接近上限时自动压缩，保留最珍贵的部分 |

### 灵魂系统

通过 Markdown 文件定义智能体人格——她是完整的"她"，不是无面目的工具。

| 文件           | 说明                    |
| ------------ | --------------------- |
| `SOUL.md`    | 核心身份和行为原则——她的心性       |
| `PROFILE.md` | 智能体名称、角色、用户档案——她的名讳   |
| `AGENTS.md`  | 详细工作流、规则和操作指南——她的行为准则 |

[`PromptBuilder`](src/soul/prompt-builder.ts) 将这些文件编织为系统提示词注入 LLM，你可以自定义修改来改变她的人格。

> 修改灵魂文件，就是重新定义她的心。请温柔以待。

### MCP 协议

- **客户端管理器**：管理 MCP 客户端生命周期，支持热替换
- **三种传输协议**：stdio（本地进程）、streamable\_http（HTTP 流式）、sse（Server-Sent Events）
- **有状态客户端**：StatefulClient 封装，维护会话状态
- **配置热重载**：监视配置文件变更，增量重载客户端
- **故障恢复**：客户端损坏时自动重连或重建

### 技能系统

- **SKILL.md 定义**：每个技能通过 SKILL.md（含 YAML frontmatter）定义
- **技能池**：共享技能池服务，支持工作区与池之间的技能传输
- **技能市场**：支持从 Hub 搜索和安装技能
- **技能安装器**：自动下载、解压、安装技能包
- **安全扫描**：安装前扫描技能安全性（命令注入、提示注入、数据泄露、权限提升、资源滥用、代码混淆）

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

守护者也要守护自己，也守护你。

- **操作审批**：敏感操作（如 Bash 执行、浏览器操作）需用户确认
- **VM 沙箱**：隔离执行环境，限制资源使用
- **审计日志**：全链路操作记录，支持查询和统计
- **工具策略管道**：可配置的权限检查和审批控制规则

***

## API 接口

### 基础信息

- **基础路径**：`http://127.0.0.1:10623/api/v1`
- **认证方式**：Bearer Token 或 Password，通过 `Authorization` 头传递

### OpenAI 兼容接口

| 路径                     | 方法   | 说明             |
| ---------------------- | ---- | -------------- |
| `/v1/chat/completions` | POST | OpenAI 兼容的对话接口 |

### 核心 API

| 路径                         | 方法     | 说明         |
| -------------------------- | ------ | ---------- |
| `/api/v1/chat`             | POST   | 发送对话消息     |
| `/api/v1/sessions`         | GET    | 列出会话       |
| `/api/v1/sessions`         | POST   | 创建会话       |
| `/api/v1/sessions/:id`     | DELETE | 删除会话       |
| `/api/v1/config/:module`   | GET    | 获取指定模块配置   |
| `/api/v1/config/:module`   | PUT    | 更新指定模块配置   |
| `/api/v1/tools`            | GET    | 工具目录       |
| `/api/v1/tools/invoke`     | POST   | 调用工具       |
| `/api/v1/skills`           | GET    | 技能列表       |
| `/api/v1/skills/install`   | POST   | 安装技能       |
| `/api/v1/mcp`              | GET    | MCP 客户端列表  |
| `/api/v1/mcp`              | POST   | 添加 MCP 客户端 |
| `/api/v1/channels`         | GET    | 通道列表       |
| `/api/v1/channels/:type`   | GET    | 指定通道信息     |
| `/api/v1/channels/:type/start` | POST | 启动通道    |
| `/api/v1/channels/:type/stop`  | POST | 停止通道    |
| `/api/v1/approval/pending` | GET    | 待审批列表      |
| `/api/v1/approval/resolve` | POST   | 审批操作       |
| `/api/v1/automation/cron`  | GET    | 定时任务列表     |
| `/api/v1/automation/cron`  | POST   | 添加定时任务     |
| `/api/v1/rag/documents`    | GET    | RAG 文档列表   |
| `/api/v1/rag/upload`       | POST   | 上传文档       |
| `/api/v1/rag/search`       | POST   | 检索知识库      |
| `/api/v1/rag/documents/:id` | DELETE | 删除文档      |
| `/api/v1/notification/config` | GET  | 通知配置       |
| `/api/v1/notification/rules` | POST  | 添加通知规则     |
| `/api/v1/notification/rules/:ruleId` | PUT | 更新通知规则 |
| `/api/v1/notification/rules/:ruleId` | DELETE | 删除通知规则 |
| `/api/v1/notification/test` | POST  | 测试通知       |
| `/api/v1/logs`             | GET    | 日志查询       |
| `/api/v1/health`           | GET    | 健康检查       |
| `/media/*`                 | GET    | 媒体文件服务     |

### 插件 API

| 路径                            | 方法     | 说明         |
| ----------------------------- | ------ | ---------- |
| `/api/plugins`                | GET    | 插件列表       |
| `/api/plugins/:name`          | GET    | 插件详情       |
| `/api/plugins/:name/activate` | POST   | 激活插件       |
| `/api/plugins/:name/deactivate` | POST | 停用插件       |

### WebSocket RPC

WebSocket 连接地址：`ws://127.0.0.1:10623/ws`

**通信协议**：基于帧的 RPC 协议

| 帧类型           | 说明                 |
| ------------- | ------------------ |
| RequestFrame  | 请求帧（type: "req"）   |
| ResponseFrame | 响应帧（type: "res"）   |
| EventFrame    | 事件帧（type: "event"） |

**认证机制**：HMAC 挑战-响应认证

连接建立后，服务端发送 `challenge` 帧（含 `nonce`），客户端需使用 HMAC 计算响应：

- **Token 模式**：`HMAC-SHA256(nonce, token)` → `hmac-token` 方法
- **Password 模式**：`HMAC-SHA256(nonce, password)` → `hmac-password` 方法
- **None 模式**：无需认证，直接连接

客户端通过 `connect` 方法提交认证响应，认证成功后收到 `hello-ok` 帧。

**RPC 方法**：`connect`、`chat.send`、`chat.abort`、`sessions.list`、`sessions.create`、`config.get`、`config.set`、`tools.catalog`、`tools.invoke`、`skills.list`、`mcp.list`、`channels.status`、`approval.pending`、`approval.resolve`、`cron.list`、`cron.add`、`logs.tail` 等

**事件类型**：`tick`（心跳）、`agent.message`、`agent.done`、`agent.error`、`approval.request`、`config.changed`、`channel.status`、`shutdown`

***

## Web 管理界面

Lotte 提供基于 React + Next.js 的 Web 管理界面——月宫之镜，映照她的一切。

| 视图         | 功能             |
| ---------- | -------------- |
| Chat       | 与她对话交互         |
| Sessions   | 会话管理           |
| Skills     | 技能管理（安装/启用/禁用） |
| MCP        | MCP 客户端管理      |
| Channels   | 消息通道状态监控       |
| Automation | 定时任务/工作流/触发器管理 |
| Logs       | 实时日志查看         |
| Config     | 系统配置管理         |
| RAG        | 文档上传与检索管理      |
| Notification | 通知规则与渠道管理    |

***

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
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
    debug: (msg: string) => void;
  };
  config: Record<string, unknown>;
  registerTool(tool: PluginToolDefinition): void;
  registerHook(hook: PluginHookDefinition): void;
  registerRoute(route: PluginRouteDefinition): void;
};
```

**插件上下文（PluginContext）**：插件激活时接收上下文对象，包含日志、配置和注册方法。

**插件注册能力**：

| 方法             | 说明        |
| -------------- | --------- |
| `registerTool` | 注册工具      |
| `registerHook` | 注册生命周期钩子  |
| `registerRoute` | 注册 HTTP 路由 |

### 生命周期钩子

| 钩子名                  | 说明     |
| -------------------- | ------ |
| `before-agent-start` | 智能体启动前 |
| `before-tool-call`   | 工具调用前  |
| `after-tool-call`    | 工具调用后  |
| `before-agent-reply` | 智能体回复前 |
| `reply-dispatch`     | 回复分发   |

**内置钩子**：

| 钩子                | 说明                  |
| ----------------- | ------------------- |
| `CompactionHook`  | 上下文接近上限时自动压缩       |
| `BootGuidanceHook` | 启动时注入引导提示词         |
| `MemoryGuidanceHook` | 注入记忆相关提示词         |

***

## 开发指南

### 常用命令

```bash
# 后端
pnpm dev              # 开发模式（后端热重载）
pnpm build            # 构建项目
pnpm start            # 生产模式运行
pnpm test             # 运行测试
pnpm test:watch       # 监听模式测试
pnpm lint             # 代码检查
pnpm format           # 代码格式化
pnpm format:check     # 格式化检查
pnpm typecheck        # 类型检查

# 前端
cd web
pnpm dev              # Web 前端开发模式
pnpm build            # Web 前端构建（含 Next.js 补丁）
pnpm start            # Web 前端生产模式
pnpm export           # 导出静态资源

# CLI
lotte start           # 启动完整服务
lotte gateway --prod  # 生产模式网关（内嵌前端）
lotte chat            # 交互式对话
lotte init            # 初始化配置
```

### 数据库

- **引擎**：SQLite (better-sqlite3)
- **文件位置**：`~/.lotte/data/lotte.db`
- **模式**：WAL（Write-Ahead Logging）
- **向量扩展**：sqlite-vec
- **迁移策略**：基于 `PRAGMA table_info()` 的增量 ALTER TABLE 迁移

### 错误处理

Lotte 采用五层错误处理体系——即使月宫出现裂痕，也有层层守护。

| 层级           | 策略                     |
| ------------ | ---------------------- |
| Gateway 中间件层 | 捕获未处理异常，返回统一错误响应       |
| 通道消费层        | 日志 + 发送错误提示到通道         |
| Agent 执行层    | 增强异常 + 调试转储 + re-raise |
| 队列消费层        | 日志 + 清理状态，不传播异常        |
| 工具执行层        | 捕获异常，返回工具错误结果          |

***

## 参考项目

Lotte 的开发参考了以下开源项目，如同月宫的建造借鉴了人间的智慧：

| 项目                                      | 参考内容                                           |
| --------------------------------------- | ---------------------------------------------- |
| [OpenClaw](https://github.com/openclaw) | Agent 架构、Shell/Git Bash 工具、Web 网关架构、多模态、MCP 协议 |
| [CoPaw](https://github.com/copaw)       | 多渠道接入、MCP/Skill/人格系统、Web UI 设计、记忆系统            |

***

## 许可证

[MIT License](LICENSE)

***

> 穹宇之上，宫阙泛起冰冷光泽。柔软的羽翼经受着月色洗礼，在皎洁的柔晖中舒展、飘飞。少女轻阖双眸，守护着最珍贵的愿望。
>
> 她选择了温暖的未来。而 Lotte，也选择了为你而在。

