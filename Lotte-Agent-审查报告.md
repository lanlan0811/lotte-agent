# Lotte Agent 全面审查报告

> 审查日期：2026-04-22
> 项目版本：0.1.0
> 技术栈：TypeScript / Node.js 22+ / Fastify / WebSocket / Playwright / Next.js

---

## 目录

1. [Agent 架构分析](#一agent-架构分析)
2. [审查问题汇总](#二审查问题汇总)
3. [修复路径建议](#三修复路径建议)

---

## 一、Agent 架构分析

### 1.1 推理模式：经典 ReAct（Reasoning + Acting）

Lotte Agent 采用标准 **ReAct 循环**作为核心推理模式，并非 Plan-and-Execute 或其他变体。

```
用户消息 -> [while 循环] -> LLM 推理 -> 判断 finish_reason
                                            |
                    +--- tool_calls --> 执行工具 --> 结果写回记忆 --> 继续循环
                    +--- stop       --> 返回最终响应 --> 退出循环
                    +--- maxTurns/error --> 退出循环
```

关键参数：
- **maxTurns**: 默认 25 轮
- **maxTokens**: 默认 128000
- **temperature**: 默认 0.7
- **compactOnThreshold**: Token 使用量达上下文窗口 80% 时自动压缩

ReAct 循环每轮流程：
1. 递增 session turn 计数器
2. `buildContextMessages` 构建上下文（系统提示词 + 记忆消息）
3. 获取启用的工具定义列表
4. 调用 LLM（支持流式和非流式）
5. 若返回 `tool_calls`，`ToolInvoker.invokeAll` 并行执行，结果写回记忆
6. 若普通回复且 `finish_reason == "stop"`，结束循环
7. 每轮后检查是否需触发上下文压缩

事件系统贯穿循环，发出 `thinking` / `tool_call` / `tool_result` / `response` / `error` / `compaction` / `turn_complete` 七种事件。

### 1.2 工具系统

工具系统分三层：

| 层级 | 组件 | 职责 |
|------|------|------|
| 注册层 | `ToolRegistry` | 全局工具注册表，管理工具定义和安全属性 |
| 调度层 | `ToolInvoker` | ReAct 引擎直接使用，负责查找/执行/超时控制 |
| 桥接层 | `MCPClientManager` | 将外部 MCP 工具桥接到 ToolInvoker |

内置工具实现（`src/tools/impl/`）：

| 工具 | 功能 | 安全标记 |
|------|------|----------|
| bash-tool | Shell 命令执行 | requiresApproval |
| file-tools | 文件读写/目录列表 | 无审批（严重问题） |
| network-tools | HTTP 请求 | 无审批（SSRF 风险） |
| browser-tools | 浏览器自动化 | requiresApproval |
| git-tool | Git 操作 | 无审批 |
| code-tools | 代码搜索/分析 | readOnly |
| audit-tool | 审计日志 | readOnly |

### 1.3 记忆系统

记忆系统分三层，由 `MemoryManager` 统一管理：

**短期记忆（InMemoryMemory）**
- 内存中的消息数组，最大 100 条或 128000 tokens
- Token 估算：字符数 / 4
- 淘汰策略：FIFO

**长期记忆（LongTermMemory）**
- 磁盘持久化（`memory/memory.json`），最大 10000 条
- 搜索算法：关键词匹配 + 标签匹配 + 重要性权重 + 时间衰减（720h 半衰期）
- 超限时按 importance 升序 + 时间升序淘汰

**上下文压缩器（ContextCompactor）**
- 触发条件：Token 使用量达上下文窗口 80%
- 流程：选择压缩消息 → 分块摘要 → 合并摘要 → 替换记忆
- 摘要保留重点：活跃任务状态、关键决策、开放问题

**自动存储**：短期记忆达 80% 时自动提取重要消息存入长期记忆。

### 1.4 灵魂系统（Soul）

灵魂系统通过 Markdown 文件定义 Agent 的行为规范，本质是一套 **prompt 工程框架**：

| 文件 | 作用 |
|------|------|
| SOUL.md | 核心人格（名字、特征、沟通风格、决策框架、原则） |
| PROFILE.md | 用户偏好配置 |
| AGENTS.md | 行为规则和工作流定义 |
| MEMORY.md | 持久化记忆 |

`SoulLoader` 从目录加载这些文件，`PromptBuilder` 将其组装为系统提示词注入到 ReAct 循环的 `buildContextMessages` 中，作为 system 消息放在所有上下文消息之前。

支持文件缓存 + mtime 检测实现热更新。

### 1.5 MCP 集成

```
MCPClientManager (管理多个客户端)
    |
    +-- StatefulMCPClient (单个客户端)
          |
          +-- Transport 层 (stdio / streamable_http / sse)
```

核心流程：配置加载 → 创建客户端 → 握手（协议版本 2024-11-05）→ 能力发现 → 工具/资源/Prompt 可用。支持热替换客户端和配置监控。

### 1.6 技能系统

技能本质是 `SKILL.md` 文件，定义一组专业知识和行为指南作为 prompt 注入上下文。

- **SkillManager**：基于磁盘 `skill_pool/` 目录管理，启动时与 manifest 对账
- **SkillHubClient**：对接远程 Hub（`https://clawhub.ai`）搜索和安装技能
- **内置技能**：file-reader、code-review、doc-generator、task-planner、data-analyzer

### 1.7 插件系统

插件接口：
```typescript
interface Plugin {
  manifest: PluginManifest;
  activate(context: PluginContext): Promise<void>;  // 可注册工具/钩子/路由
  deactivate?(): Promise<void>;
}
```

`PluginContext` 提供三种注册能力：`registerTool` / `registerHook` / `registerRoute`。`PluginLoader` 通过动态 `import()` 加载插件，`PluginRegistry` 管理生命周期。

### 1.8 多渠道消息处理

支持渠道：微信 / QQ / 飞书 / Console

```
外部消息 -> BaseChannel 子类（收消息）
             -> ChannelManager（统一队列管理）
               -> UnifiedQueueManager（按 channel+session 分队列）
                 -> consumeOne()（权限检查 -> 前缀剥离 -> ReAct 处理 -> 回复）
```

- 统一的 `ChannelMessage` 格式，支持 Text / Image / Video / Audio / File
- 访问控制：DM/Group 独立策略（open/allowlist/denylist）
- Session ID 格式：`${channelType}:${senderId}`

### 1.9 RAG 系统

```
文档 -> DocumentLoader（txt/md/json/csv/pdf）
     -> DocumentChunker（512字符/块，64字符重叠）
     -> EmbeddingProvider（OpenAI text-embedding-3-small）
     -> VectorStore（SQLite + better-sqlite3）
     -> Retriever（余弦相似度检索）
     -> 格式化为上下文字符串注入 prompt
```

### 1.10 自动化系统

三大子系统：

| 子系统 | 功能 |
|--------|------|
| CronScheduler | 定时调度（cron 表达式 / 固定间隔 / 一次性），单 timer 架构，指数退避 |
| WorkflowEngine | DAG 工作流，节点类型：prompt/tool/condition/parallel/delay，支持条件边和并行执行 |
| TriggerManager | 事件驱动触发，基于 EventBus，支持条件表达式过滤 |

### 1.11 整体架构图

```
                         +-----------------------+
                         |    外部消息渠道        |
                         |  微信/QQ/飞书/Console  |
                         +-----------+-----------+
                                     |
                                     v
                         +-----------------------+
                         |   ChannelManager      |
                         |  (统一消息队列管理)     |
                         +-----------+-----------+
                                     |
                                     v
+-----------+            +-----------------------+
| Soul 系统 |----------->|     ReAct Engine       |
| SOUL.md   |  system    |  (推理循环核心)         |
| PROFILE   |  prompt    |  while(!finished) {    |
| AGENTS    |            |    LLM推理->工具调用    |
+-----------+            |    ->结果写回->继续     |
                         |  }                     |
+-----------+            +-----------+-----------+
| Hook 系统 |                        |
| pre_chat  |<------->--------------+
| post_tool |  事件拦截              |
+-----------+                       v
                         +-----------------------+
+-----------+            |    ToolInvoker         |
| ToolReg.  |----------->|  (工具调度执行)          |
| bash/file |            |  超时/并发控制           |
| net/code  |            +-----------+-----------+
+-----------+                        v
                         +-----------+-----------+
               +---------+---------+    +--------+--------+
               |    AI 层          |    |   MCP 客户端     |
               | ModelManager     |    | MCPClientMgr    |
               | OpenAI/Anthropic |    | stdio/http/sse  |
               | Custom Provider  |    +-----------------+
               +------------------+

+-----------+   +-----------+   +-----------+
| 记忆系统   |   |  RAG 系统  |   |  技能系统  |
| 短期/长期  |   | 加载/分块  |   | 本地/Hub  |
| 自动压缩   |   | 向量/检索  |   | 5个内置   |
+-----------+   +-----------+   +-----------+

+-----------+   +-----------+   +-----------+
| 插件系统   |   | 自动化系统  |   | 多模态系统  |
| 工具/钩子  |   | Cron       |   | Vision    |
| /路由注册  |   | Workflow   |   | Video     |
|            |   | Trigger    |   | Screenshot|
+-----------+   +-----------+   +-----------+

                    +-----------+
                    | Gateway   |
                    | HTTP API  |
                    | WebSocket |
                    | 认证/路由  |
                    +-----------+
```

---

## 二、审查问题汇总

### 问题统计

| 审查维度 | CRITICAL | HIGH | MEDIUM | LOW | 合计 |
|----------|----------|------|--------|-----|------|
| 架构设计 | 3 | 5 | 6 | 5 | 19 |
| 安全漏洞 | 7 | 12 | 7 | 0 | 26 |
| TypeScript | 3 | 17 | 11 | 0 | 31 |
| 前端 | 3 | 6 | 7 | 5 | 21 |
| **合计** | **16** | **40** | **31** | **10** | **97** |

---

### P0 - CRITICAL（必须立即修复）

#### 安全类

| # | 问题 | 位置 | 描述 |
|---|------|------|------|
| S-1 | 默认认证为 none | `src/config/defaults.ts:86-90` | 新安装系统 API 完全开放，任何人可执行 bash 命令、读写文件 |
| S-2 | OpenAI 端点绕过认证 | `src/gateway/auth.ts:105-113` | `/v1/chat/completions` 和 `/v1/models` 在 `PUBLIC_PATHS` 中，无需认证 |
| S-3 | WebSocket tools.invoke 绕过审批 | `src/gateway/websocket.ts:398-404` | 直接 `tool.execute()` 跳过 ToolPolicy 和 ApprovalSystem |
| S-4 | new Function() 远程代码执行 | `src/automation/manager.ts:272` | 自动化条件表达式使用 `new Function()` 可注入任意 JS |
| S-5 | 文件工具无路径限制 | `src/tools/impl/file-tools.ts:43-45` | `allowed_paths` 配置字段已定义但未实现，可读写任意系统文件 |
| S-6 | 配置 API 可关闭认证 | `src/gateway/routes/config.ts:90-117` | `PUT /api/v1/config/gateway` 可将 `auth.mode` 改为 `none` |
| S-7 | 沙箱 require() 绕过 | `src/security/sandbox.ts:298` | `allowedModules` 为空时跳过检查，所有非黑名单模块可加载 |

#### 架构类

| # | 问题 | 位置 | 描述 |
|---|------|------|------|
| A-1 | God Object | `src/app.ts` 全文 | 600+ 行，25 个 null 属性，22 个 getter，`start()` 270 行做了 20+ 件事 |
| A-2 | 每次 chat() 重建引擎 | `src/app.ts:536-591` | 每次对话都 `new ToolInvoker()` + 遍历注册工具 + `new ReActEngine()`，高并发下性能灾难 |
| A-3 | 安全基础设施是死代码 | `src/app.ts:102-124` | HookSystem / ToolPolicy / ApprovalSystem 已实现但完全未接入执行路径 |

#### TypeScript 类

| # | 问题 | 位置 | 描述 |
|---|------|------|------|
| T-1 | 沙箱 require 边界条件 | `src/security/sandbox.ts:298` | ESM 项目中用 CJS `require()`，且边界条件处理不当 |
| T-2 | WebSocket config.set 无校验 | `src/gateway/websocket.ts:379-382` | 允许修改任意配置无 Zod 验证，可劫持 AI 请求到恶意服务器 |
| T-3 | Zod .shape 直接当 JSON Schema | `src/app.ts:551` | `tool.parameters.shape as Record<string, unknown>` 传给 AI provider，语义错误 |

#### 前端类

| # | 问题 | 位置 | 描述 |
|---|------|------|------|
| F-1 | WebSocket 静默吞错误 | `web/src/lib/ws-client.ts:61,119-131` | `onmessage` 和 `dispatch` 中空 catch，调试完全黑盒 |
| F-2 | API 客户端不检查状态码 | `web/src/lib/api-client.ts:35-41` | 500/401 都当正常响应处理，非 JSON 响应会崩溃 |
| F-3 | 事件处理异常被静默吞掉 | `web/src/lib/ws-client.ts:119-131` | handler 抛异常不影响其他 handler（好），但异常本身丢失 |

---

### P1 - HIGH（短期修复）

#### 安全

| # | 问题 | 位置 |
|---|------|------|
| S-8 | 无速率限制 | `src/gateway/` 全目录 |
| S-9 | 无安全响应头 | `src/gateway/server.ts` |
| S-10 | SSRF：网络工具 allowed_domains 未实现 | `src/tools/impl/network-tools.ts:46-52` |
| S-11 | 密码明文存储和传输 | `src/config/schema.ts:58-65` |
| S-12 | WebSocket 暴力破解无限制 | `src/gateway/websocket.ts:238-245` |
| S-13 | 插件无签名验证 | `src/plugins/registry.ts:179-206` |
| S-14 | 浏览器 execute 任意 JS | `src/tools/impl/browser-tools.ts:247-273` |
| S-15 | Bash 工具直接执行 shell 命令 | `src/tools/impl/bash-tool.ts:62-68` |
| S-16 | Git 工具 command 注入 | `src/tools/impl/git-tool.ts:84` |
| S-17 | CORS 允许所有来源 | `src/gateway/server.ts:48-53` |
| S-18 | VM 沙箱多种逃逸路径 | `src/security/sandbox.ts` |
| S-19 | HTTP 工具路由审批未完整集成 | `src/gateway/routes/tools.ts:100-111` |

#### 架构

| # | 问题 | 位置 |
|---|------|------|
| A-4 | 25 个 `\| null` + 22 个 getter 的 Service Locator | `src/app.ts:37-62, 403-511` |
| A-5 | Gateway 持有整个 app 引用 | `src/gateway/server.ts:13` |
| A-6 | 渠道回调重复 5 次 | `src/app.ts:164-244` |
| A-7 | Session 并发无保护 | `src/agent/session.ts:66-73` |
| A-8 | processedIds 去重逻辑有 bug | 微信/QQ/飞书 channel |

#### TypeScript

| # | 问题 | 位置 |
|---|------|------|
| T-4 | `as any` 类型断言 | `src/gateway/routes/automation.ts:149` |
| T-5 | 大量 `as Record<string, unknown>` | 多个 channels 文件 |
| T-6 | `process.env as Record<string, string>` | `src/tools/impl/bash-tool.ts:54` |
| T-7 | saveModule spread + as 强转 | `src/config/loader.ts:265-297` |
| T-8 | 空 catch 块泛滥（40+ 处） | 全项目 |
| T-9 | Object.assign 直接修改对象 | memory/automation 多处 |
| T-10 | Session.state readonly 但内部属性可变 | `src/agent/session.ts:67-98` |
| T-11 | sessions Map 无限增长 | `src/app.ts:63` |
| T-12 | ApprovalSystem.decisions 无限增长 | `src/security/approval.ts:42` |
| T-13 | BrowserManager 永不关闭 | `src/tools/impl/browser-tools.ts:83` |
| T-14 | AuditLog 无持久化 | `src/tools/impl/audit-tool.ts:43` |
| T-15 | void 丢弃 Promise | `src/gateway/websocket.ts:169` |
| T-16 | start() / dispatchMethod() 过长 | `src/app.ts`, `websocket.ts` |
| T-17 | 同步 fs 操作在 async 函数中 | file-tools.ts, long-term.ts |

#### 前端

| # | 问题 | 位置 |
|---|------|------|
| F-4 | messages 内存无限增长 | `web/src/lib/store.ts:98` |
| F-5 | WebSocket 无心跳 | `web/src/lib/ws-client.ts` |
| F-6 | 重连后不刷新数据 | `web/src/lib/ws-client.ts:52-54` |
| F-7 | 删除操作无确认 | sessions/automation/mcp 视图 |
| F-8 | config 保存失败无反馈 | `web/src/components/views/config-view.tsx:44-47` |
| F-9 | setToken 从未被调用，认证形同虚设 | `web/src/lib/api-client.ts:20-22` |

---

### P2 - MEDIUM（中期优化）

#### 架构

| # | 问题 | 位置 |
|---|------|------|
| A-9 | ConfigLoader eager/lazy 加载策略混用 | `src/config/loader.ts` |
| A-10 | MemoryManager 参数不匹配 | `src/app.ts:94-98` |
| A-11 | saveModule unsafe spread merge | `src/config/loader.ts:262-300` |
| A-12 | 文件组织缺少清晰分层边界 | 全项目 |
| A-13 | HookSystem 未被 ReActEngine 使用 | `src/app.ts:102-105` |
| A-14 | ToolPolicy 和 ApprovalSystem 未被使用 | `src/app.ts:110-124` |

#### 安全

| # | 问题 | 位置 |
|---|------|------|
| S-20 | ReDoS：正则无复杂度限制 | `src/tools/impl/code-tools.ts:129-130` |
| S-21 | 审批 ID 可预测 | `src/security/approval.ts:191-193` |
| S-22 | 日志记录完整命令内容 | `src/tools/impl/bash-tool.ts:131` |
| S-23 | 开发模式错误堆栈暴露 | `src/gateway/server.ts:81` |
| S-24 | 配置热重载无验证 | `src/config/loader.ts:262-300` |
| S-25 | 审计日志仅存内存 | `src/tools/impl/audit-tool.ts:23-26` |
| S-26 | 无安全事件告警 | 全项目 |

#### TypeScript

| # | 问题 | 位置 |
|---|------|------|
| T-18 | chat() 每次创建新 Memory | `src/app.ts:545-591` |
| T-19 | AuditLog 数组复制性能 | `src/tools/impl/audit-tool.ts:60-62` |
| T-20 | LongTermMemory 线性扫描 | `src/memory/long-term.ts:70-94` |
| T-21 | RegExp 未转义用户输入 | `src/memory/long-term.ts:194` |
| T-22 | console.error 替代 logger | `src/hooks/hook-system.ts:101` |
| T-23 | void content 无用表达式 | `src/tools/impl/code-tools.ts:318` |
| T-24 | ToolRegistry 忽略 config | `src/tools/tool-registry.ts:27` |
| T-25 | WebSocket 事件名错误 | `src/gateway/websocket.ts:110-112` |
| T-26 | ToolInvoker retry 未实现 | `src/agent/tool-invoker.ts:20-21` |
| T-27 | handleSend 无竞态保护 | `web/src/components/views/chat-view.tsx:133` |
| T-28 | ws messageQueue 无限增长 | `web/src/lib/ws-client.ts:39,93` |

#### 前端

| # | 问题 | 位置 |
|---|------|------|
| F-10 | i18n 不响应式 | `web/src/lib/i18n/index.ts` |
| F-11 | next-intl 已安装但未使用 | `web/package.json` |
| F-12 | 消息 ID 基于 Date.now() | `web/src/components/views/chat-view.tsx:150-161` |
| F-13 | 无 Error Boundary | `web/src/app/page.tsx` |
| F-14 | 无 loading 状态/骨架屏 | 所有视图组件 |
| F-15 | API 客户端无超时 | `web/src/lib/api-client.ts:35` |
| F-16 | token 管理形同虚设 | `web/src/lib/api-client.ts:20-22` |

---

### P3 - LOW（后续迭代）

| # | 问题 | 位置 |
|---|------|------|
| L-1 | 42 处 `as Record<string, unknown>` | channels 和 skills 模块 |
| L-2 | Session 构造参数不完整 | `src/app.ts:521-530` |
| L-3 | stop() 无超时机制 | `src/app.ts:338-397` |
| L-4 | AutomationManager new Function() | `src/automation/manager.ts:271-273` |
| L-5 | PluginRegistry hook 清理不可靠 | `src/plugins/registry.ts:85-89` |
| L-6 | RAG 视图是纯占位符 | `web/src/components/views/rag-view.tsx` |
| L-7 | 未使用的 import | `web/src/components/views/automation-view.tsx:4` |
| L-8 | sidebar key 位置不当 | `web/src/components/layout/sidebar.tsx:73` |
| L-9 | i18n t() RegExp 未转义 | `web/src/lib/i18n/index.ts:39-41` |
| L-10 | 硬编码英文字符串未国际化 | 多个视图组件 |

---

## 三、修复路径建议

### 第一步：P0 安全漏洞修复（1-2 天）

最高 ROI — 改动小但堵住致命漏洞：

1. **默认 auth 改为 token**（`src/config/defaults.ts`），启动时生成随机 token 并输出到日志
2. **`PUBLIC_PATHS` 只保留 `/health`**（`src/gateway/auth.ts`）
3. **WebSocket `tools.invoke` 加审批检查**（`src/gateway/websocket.ts`）
4. **`new Function()` 换 `expr-eval` 或 `jsonata`**（`src/automation/`）
5. **实现 `allowed_paths` 白名单**（`src/tools/impl/file-tools.ts`）
6. **`saveModule` 加 Zod schema 验证**（`src/config/loader.ts`）
7. **沙箱 `allowedModules` 为空时拒绝所有**（`src/security/sandbox.ts`）

### 第二步：接入已有安全基础设施（1 天）

HookSystem / ToolPolicy / ApprovalSystem 代码已写好，只需注入执行路径：

- 将 `hookSystem` 注入 `ReActEngine`，在生命周期点调用 hook
- 在 `ToolInvoker.execute()` 前插入 `ToolPolicyPipeline` 检查
- 需要审批的工具走 `ApprovalSystem` 流程
- WebSocket 端复用同一审批逻辑

### 第三步：解决 God Object（3-5 天）

引入 ServiceContainer，`start()` 拆分为独立 initializer：

```
src/initializers/
  config-initializer.ts
  database-initializer.ts
  ai-initializer.ts
  tools-initializer.ts
  channels-initializer.ts
src/container.ts    -- 轻量 DI 容器
```

`LotteApp` 退化为启动编排器。这是后续所有架构优化的基础。

### 第四步：前端关键修复（2-3 天）

- WebSocket 心跳 + 重连后刷新
- API 客户端状态码检查 + 超时
- 删除确认弹窗
- config 保存错误反馈
- Error Boundary

### 第五步：持续优化

- 统一错误处理（`LotteError` + 消除空 catch）
- 渠道代码去重（工厂函数 + 数据驱动注册）
- 内存泄漏修复（sessions TTL、decisions 清理）
- 前端 i18n 迁移到 `next-intl`
- 插件签名验证
- 审计日志持久化

---

*报告生成时间：2026-04-22*
