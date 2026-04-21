# Lotte 开发者指南

## 项目概述

Lotte 是一个多渠道通用智能体平台，采用 TypeScript + Node.js 开发，具备自动化和编程开发能力。项目使用 ESM 模块系统，基于 Fastify 构建 Web 网关，支持 MCP 协议、多渠道接入、技能系统和插件扩展。

***

## 技术栈

| 技术             | 版本        | 用途           |
| -------------- | --------- | ------------ |
| TypeScript     | 5.7+      | 主开发语言        |
| Node.js        | >= 22.0.0 | 运行时环境        |
| Fastify        | 5.2+      | HTTP 网关框架    |
| ws             | 8.18+     | WebSocket 服务 |
| Zod            | 3.23+     | Schema 验证    |
| better-sqlite3 | 11.0+     | 数据库          |
| sqlite-vec     | 0.1+      | 向量搜索扩展       |
| Vitest         | 3.0+      | 测试框架         |
| tsdown         | 0.21+     | 构建工具         |
| tsx            | 4.21+     | 开发运行时        |

***

## 项目架构

### 整体架构图

```
┌──────────────────────────────────────────────────────────────┐
│                        Web Frontend                          │
│              (Next.js 16 + Tailwind + shadcn/ui)             │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTP / WebSocket
┌───────────────────────────┴──────────────────────────────────┐
│                    Gateway (Fastify)                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ REST API │ │ WebSocket│ │   Auth   │ │ OpenAI Compat  │  │
│  │  Routes  │ │ Manager  │ │Middleware│ │    Routes      │  │
│  └──────────┘ └──────────┘ └──────────┘ └────────────────┘  │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────┴──────────────────────────────────┐
│                      LotteApp (Core)                         │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌───────────┐  │
│  │ Agent  │ │ Memory │ │ Tools  │ │ Skills │ │    MCP    │  │
│  │ Engine │ │ System │ │Registry│ │Manager │ │  Manager  │  │
│  └────────┘ └────────┘ └────────┘ └────────┘ └───────────┘  │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌───────────┐  │
│  │Channels│ │Automation│ │  RAG  │ │Security│ │ Multimodal│  │
│  │Manager │ │ Manager │ │Manager│ │ System │ │  Manager  │  │
│  └────────┘ └────────┘ └────────┘ └────────┘ └───────────┘  │
│  ┌────────┐ ┌────────┐ ┌────────┐                            │
│  │Plugins │ │  Soul  │ │Config  │                            │
│  │System  │ │ System │ │Loader  │                            │
│  └────────┘ └────────┘ └────────┘                            │
└──────────────────────────────────────────────────────────────┘
```

### 核心模块说明

| 模块             | 路径                  | 职责                                    |
| -------------- | ------------------- | ------------------------------------- |
| `app`          | `src/app.ts`        | 应用主入口，协调所有模块的初始化和生命周期                 |
| `agent`        | `src/agent/`        | ReAct 推理引擎、会话管理、工具调用器                 |
| `ai`           | `src/ai/`           | 多模型支持（OpenAI/Anthropic/Gemini/Custom） |
| `audit`        | `src/audit/`        | 审计日志记录和查询                             |
| `automation`   | `src/automation/`   | 定时任务、工作流、事件触发                         |
| `channels`     | `src/channels/`     | 多渠道接入（微信/QQ/飞书/控制台）                   |
| `config`       | `src/config/`       | 配置加载、验证、监视和热重载                        |
| `db`           | `src/db/`           | SQLite 数据库管理                          |
| `errors`       | `src/errors/`       | 错误处理和调试转储                             |
| `gateway`      | `src/gateway/`      | HTTP/WebSocket 网关、路由、认证               |
| `hooks`        | `src/hooks/`        | 生命周期钩子系统                              |
| `mcp`          | `src/mcp/`          | MCP 协议客户端管理                           |
| `memory`       | `src/memory/`       | 短期/长期记忆、上下文压缩                         |
| `multimodal`   | `src/multimodal/`   | 图片/视频/截图多模态处理                         |
| `notification` | `src/notification/` | 通知分发（消息/Webhook/邮件）                   |
| `plugins`      | `src/plugins/`      | 插件注册、加载和生命周期管理                        |
| `rag`          | `src/rag/`          | 文档分块、向量化、语义检索                         |
| `security`     | `src/security/`     | 操作审批、VM 沙箱                            |
| `skills`       | `src/skills/`       | 技能管理、市场、安全扫描                          |
| `soul`         | `src/soul/`         | 灵魂系统、提示词构建                            |
| `tools`        | `src/tools/`        | 工具注册表、策略管道、内置工具                       |
| `utils`        | `src/utils/`        | 通用工具函数                                |
| `voice`        | `src/voice/`        | 语音转文字                                 |

### 数据流

```
用户消息 → Channel → QueueManager → Agent Session
  → PromptBuilder（组装系统提示）
  → ReActEngine（推理循环）
    → ModelManager（调用 LLM）
    → ToolInvoker（工具调用决策）
      → ToolPolicyPipeline（权限检查 → 审批 → 沙箱 → 执行）
      → Tool.execute()
    → 结果返回 ReActEngine
  → 继续推理或生成回复
→ MemoryManager（更新记忆）
→ Channel.reply（回复用户）
```

***

## 开发环境搭建

### 前置条件

- Node.js >= 22.0.0
- npm 或 pnpm
- Git
- Windows 10 / macOS / Linux

### 安装步骤

```bash
# 克隆项目
cd d:\Trae项目
git clone <repo-url> lotte-agent
cd lotte-agent

# 安装依赖
npm install

# 构建项目
npm run build
```

### 开发模式

```bash
# 后端热重载开发
npm run dev

# 运行测试
npm run test

# 监听模式测试
npm run test:watch

# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 代码格式化
npm run format
```

### 前端开发

```bash
cd Web
npm install
npm run dev
```

***

## 代码规范

### TypeScript 配置

项目使用严格的 TypeScript 配置（`tsconfig.json`）：

- `strict: true` — 启用所有严格类型检查
- `noUnusedLocals: true` — 禁止未使用的局部变量
- `noUnusedParameters: true` — 禁止未使用的参数
- `noUncheckedIndexedAccess: true` — 数组/对象索引访问需判空
- `verbatimModuleSyntax: true` — 强制使用 `import type` 语法

### 模块系统

项目使用 **ESM** 模块系统（`"type": "module"`）：

```typescript
// 正确：使用 .js 扩展名导入（TypeScript ESM 约定）
import { foo } from "./bar.js";

// 错误：使用 .ts 扩展名
import { foo } from "./bar.ts";

// 类型导入必须使用 type 关键字
import type { Config } from "./config.js";
```

### 命名约定

| 类型   | 约定                 | 示例                                          |
| ---- | ------------------ | ------------------------------------------- |
| 类名   | PascalCase         | `ToolRegistry`, `MCPClientManager`          |
| 接口名  | PascalCase，I 前缀可选  | `GatewayDeps`, `AuthResult`                 |
| 函数名  | camelCase          | `registerRoutes()`, `buildClientResponse()` |
| 变量名  | camelCase          | `toolRegistry`, `mcpManager`                |
| 常量名  | UPPER\_SNAKE\_CASE | `MAX_PAYLOAD`, `TICK_INTERVAL_MS`           |
| 文件名  | kebab-case         | `tool-registry.ts`, `mcp-manager.ts`        |
| 目录名  | kebab-case         | `gateway/`, `tool-invoker/`                 |
| 测试文件 | 源文件名.test.ts       | `tool-registry.test.ts`                     |

### 错误处理

项目采用五层错误处理体系：

| 层级          | 策略                     | 示例                  |
| ----------- | ---------------------- | ------------------- |
| Gateway 中间件 | 捕获未处理异常，返回统一错误响应       | `setErrorHandler()` |
| 通道消费层       | 日志 + 发送错误提示到通道         | `channel.onError()` |
| Agent 执行层   | 增强异常 + 调试转储 + re-raise | `ErrorDumper`       |
| 队列消费层       | 日志 + 清理状态，不传播异常        | `QueueManager`      |
| 工具执行层       | 捕获异常，返回工具错误结果          | `tool.execute()`    |

API 路由中的错误处理模式：

```typescript
try {
  // 业务逻辑
  reply.send({ ok: true, data: result });
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  reply.status(500).send({
    ok: false,
    error: { code: "ERROR_CODE", message: msg, details: null },
  });
}
```

### 配置管理

- 所有配置项通过 JSON 文件存储在 `~/.lotte/config/` 目录
- 配置 Schema 使用 Zod 定义（`src/config/schema.ts`）
- 禁止硬编码，配置值必须来自配置文件
- 使用 `ConfigLoader` 统一加载，`ConfigWatcher` 监视变更

***

## 核心模块开发

### 添加新的 API 路由

1. 在 `src/gateway/routes/` 下创建路由文件：

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { GatewayDeps } from "../server.js";

export function registerMyRoutes(
  fastify: FastifyInstance,
  deps: GatewayDeps,
  prefix: string,
): void {
  fastify.get(`${prefix}/my-resource`, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = deps.app.getMyManager().list();
      reply.send({ ok: true, data });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      reply.status(500).send({
        ok: false,
        error: { code: "MY_ERROR", message: msg, details: null },
      });
    }
  });
}
```

1. 在 `src/gateway/routes/index.ts` 中注册：

```typescript
import { registerMyRoutes } from "./my-routes.js";

export function registerRoutes(fastify, deps, events) {
  // ...existing routes...
  registerMyRoutes(fastify, deps, apiPrefix);
}
```

### 添加新的工具

1. 在 `src/tools/impl/` 下创建工具文件：

```typescript
import { BaseTool, type ToolExecuteArgs } from "../base.js";

export class MyTool extends BaseTool {
  name = "my_tool";
  description = "My custom tool";
  category = "Custom";
  requiresApproval = false;
  dangerous = false;
  readOnly = true;

  parameters = z.object({
    input: z.string().describe("Input parameter"),
  });

  async execute(args: ToolExecuteArgs): Promise<unknown> {
    const { input } = args as { input: string };
    return { result: input.toUpperCase() };
  }
}
```

1. 在 `src/tools/impl/index.ts` 中注册：

```typescript
import { MyTool } from "./my-tool.js";

export function registerAllTools(registry: ToolRegistry): void {
  // ...existing tools...
  registry.register(new MyTool());
}
```

### 添加新的通道

1. 在 `src/channels/` 下创建通道目录和文件：

```typescript
import { BaseChannel, type ChannelInfo } from "../base.js";

export class MyChannel extends BaseChannel {
  readonly type = "my_channel";

  async start(): Promise<void> {
    // 初始化连接
  }

  async stop(): Promise<void> {
    // 关闭连接
  }

  async send(toHandle: string, text: string): Promise<void> {
    // 发送消息
  }

  getInfo(): ChannelInfo {
    return {
      type: this.type,
      status: this.status,
      messageCount: this.messageCount,
      connectedAt: this.connectedAt,
      error: this.error,
    };
  }
}
```

1. 在 `src/channels/manager.ts` 中注册通道类型。

### 添加新的 AI Provider

1. 在 `src/ai/` 下创建 Provider 文件：

```typescript
import type { AIProvider, ChatMessage, ChatResponse } from "./types.js";

export class MyProvider implements AIProvider {
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    // 调用 AI API
    return {
      content: "response",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }
}
```

1. 在 `src/ai/model-manager.ts` 中注册 Provider。

***

## 测试

### 测试框架

项目使用 Vitest 测试框架，配置文件为 `vitest.config.ts`。

### 运行测试

```bash
# 运行所有测试
npm run test

# 监听模式
npm run test:watch

# 运行特定测试文件
npx vitest run src/tools/tool-registry.test.ts

# 运行带覆盖率报告
npx vitest run --coverage
```

### 测试分类

| 类型        | 文件位置                                         | 说明           |
| --------- | -------------------------------------------- | ------------ |
| 单元测试      | `src/**/*.test.ts`                           | 测试单个模块/函数    |
| API 集成测试  | `src/gateway/routes/api-integration.test.ts` | 测试 API 路由    |
| 通道模拟测试    | `src/channels/channels.test.ts`              | 测试通道和队列      |
| MCP 客户端测试 | `src/mcp/mcp.test.ts`                        | 测试 MCP 客户端管理 |

### 编写测试

```typescript
import { describe, it, expect, beforeEach } from "vitest";

describe("MyModule", () => {
  describe("myFunction", () => {
    it("should return expected result", () => {
      const result = myFunction("input");
      expect(result).toBe("expected");
    });

    it("should handle edge cases", () => {
      expect(() => myFunction("")).toThrow("Input is required");
    });
  });
});
```

### API 集成测试

使用 Fastify 的 `inject` 方法进行 API 测试：

```typescript
import Fastify from "fastify";
import { registerMyRoutes } from "./my-routes.js";

describe("My API Routes", () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();
    registerMyRoutes(fastify, createMockDeps(), "/api/v1");
  });

  it("GET /api/v1/my-resource should return data", async () => {
    const response = await fastify.inject({
      method: "GET",
      url: "/api/v1/my-resource",
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
  });
});
```

***

## 数据库

### 概述

- **引擎**：SQLite (better-sqlite3)
- **文件位置**：`~/.lotte/data/lotte.db`
- **模式**：WAL（Write-Ahead Logging）
- **向量扩展**：sqlite-vec

### 主要数据表

| 表名              | 说明          |
| --------------- | ----------- |
| `sessions`      | 会话记录        |
| `messages`      | 消息记录        |
| `audit_logs`    | 审计日志        |
| `rag_documents` | RAG 文档元数据   |
| `rag_chunks`    | RAG 文档分块和向量 |

### 迁移策略

基于 `PRAGMA table_info()` 的增量 ALTER TABLE 迁移，在 `Database` 类初始化时自动执行。

***

## 构建与部署

### 构建

```bash
npm run build
```

构建产物输出到 `dist/` 目录，使用 tsdown 打包。

### 生产运行

```bash
npm run start
# 或直接运行
node dist/entry.js
```

### CLI 命令

Lotte 支持 CLI 命令行操作：

```bash
# 启动服务
lotte start

# 查看版本
lotte --version

# 查看帮助
lotte --help
```

***

## 项目目录结构

```
lotte-agent/
├── src/                          # 源代码
│   ├── agent/                    # 智能体引擎
│   │   ├── react-engine.ts       # ReAct 推理引擎
│   │   ├── session.ts            # 会话管理
│   │   └── tool-invoker.ts       # 工具调用器
│   ├── ai/                       # AI 模型
│   │   ├── model-manager.ts      # 模型管理器
│   │   ├── openai-provider.ts    # OpenAI 提供商
│   │   ├── anthropic-provider.ts # Anthropic 提供商
│   │   ├── gemini-provider.ts    # Gemini 提供商
│   │   └── custom-provider.ts    # 自定义提供商
│   ├── audit/                    # 审计系统
│   │   ├── logger.ts             # 审计日志记录
│   │   └── store.ts              # 审计数据持久化
│   ├── automation/               # 自动化
│   │   ├── manager.ts            # 自动化管理器
│   │   ├── cron-scheduler.ts     # Cron 调度器
│   │   ├── workflow-engine.ts    # 工作流引擎
│   │   ├── trigger-manager.ts    # 触发规则管理
│   │   └── event-bus.ts          # 事件总线
│   ├── channels/                 # 消息通道
│   │   ├── base.ts               # 通道基类
│   │   ├── manager.ts            # 通道管理器
│   │   ├── queue.ts              # 统一队列
│   │   ├── weixin/               # 微信通道
│   │   ├── qq/                   # QQ 通道
│   │   └── feishu/               # 飞书通道
│   ├── config/                   # 配置系统
│   │   ├── schema.ts             # Zod Schema 定义
│   │   ├── loader.ts             # 配置加载器
│   │   ├── watcher.ts            # 配置监视器
│   │   └── paths.ts              # 路径管理
│   ├── db/                       # 数据库
│   │   └── database.ts           # SQLite 管理
│   ├── gateway/                  # Web 网关
│   │   ├── server.ts             # Fastify 服务器
│   │   ├── websocket.ts          # WebSocket 管理
│   │   ├── auth.ts               # 认证中间件
│   │   ├── events.ts             # 事件发射器
│   │   ├── openai-compat.ts      # OpenAI 兼容接口
│   │   └── routes/               # API 路由
│   ├── hooks/                    # 钩子系统
│   ├── mcp/                      # MCP 协议
│   │   ├── manager.ts            # MCP 客户端管理
│   │   ├── client.ts             # MCP 客户端
│   │   ├── stdio-transport.ts    # stdio 传输
│   │   ├── http-transport.ts     # HTTP/SSE 传输
│   │   └── watcher.ts            # 配置热重载
│   ├── memory/                   # 记忆系统
│   │   ├── short-term.ts         # 短期记忆
│   │   ├── long-term.ts          # 长期记忆
│   │   ├── compactor.ts          # 上下文压缩
│   │   └── memory-manager.ts     # 记忆管理器
│   ├── multimodal/               # 多模态
│   ├── notification/             # 通知系统
│   ├── plugins/                  # 插件系统
│   │   ├── registry.ts           # 插件注册表
│   │   ├── sdk.ts                # 插件 SDK
│   │   └── types.ts              # 插件类型定义
│   ├── rag/                      # RAG 知识库
│   ├── security/                 # 安全系统
│   │   ├── approval.ts           # 操作审批
│   │   └── sandbox.ts            # VM 沙箱
│   ├── skills/                   # 技能系统
│   │   ├── manager.ts            # 技能管理器
│   │   ├── hub.ts                # 技能市场
│   │   ├── scanner.ts            # 安全扫描
│   │   └── builtins.ts           # 内置技能
│   ├── soul/                     # 灵魂系统
│   │   ├── prompt-builder.ts     # 提示词构建
│   │   └── soul-loader.ts        # 灵魂加载器
│   ├── tools/                    # 工具系统
│   │   ├── base.ts               # 工具基类
│   │   ├── tool-registry.ts      # 工具注册表
│   │   ├── index.ts              # 策略管道
│   │   └── impl/                 # 工具实现
│   ├── utils/                    # 工具函数
│   ├── voice/                    # 语音系统
│   ├── app.ts                    # 应用主类
│   ├── entry.ts                  # 入口文件
│   └── index.ts                  # 导出文件
├── Web/                          # Web 前端
├── project-overview/             # 项目文档
├── package.json                  # 项目配置
├── tsconfig.json                 # TypeScript 配置
└── vitest.config.ts              # 测试配置
```

***

## 常用开发命令速查

| 命令                        | 说明              |
| ------------------------- | --------------- |
| `npm run dev`             | 后端热重载开发         |
| `npm run build`           | 构建项目            |
| `npm run start`           | 生产模式运行          |
| `npm run test`            | 运行所有测试          |
| `npm run test:watch`      | 监听模式测试          |
| `npm run lint`            | ESLint 代码检查     |
| `npm run format`          | Prettier 格式化    |
| `npm run format:check`    | 格式化检查           |
| `npm run typecheck`       | TypeScript 类型检查 |
| `cd Web && npm run dev`   | 前端开发            |
| `cd Web && npm run build` | 前端构建            |

