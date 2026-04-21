# Lotte 插件开发文档

## 概述

Lotte 插件系统允许开发者扩展平台功能，包括注册自定义工具、监听生命周期钩子、添加 HTTP 路由等。插件通过标准的 `Plugin` 接口与核心系统交互。

---

## 插件目录结构

```
plugins/
└── my-plugin/
    ├── index.ts          # 插件入口
    ├── package.json      # 插件元数据
    └── README.md         # 插件文档
```

---

## 快速开始

### 方式一：使用 `definePlugin` 函数（推荐）

```typescript
import { definePlugin, createToolDefinition } from "../plugins/sdk.js";

export default definePlugin({
  name: "my-plugin",
  version: "1.0.0",
  description: "My custom plugin",
  author: "developer",
  async onActivate(context) {
    context.logger.info("Plugin activated!");

    context.registerTool(
      createToolDefinition({
        name: "hello",
        description: "Say hello",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Name to greet" },
          },
          required: ["name"],
        },
        execute: async (args) => {
          return { message: `Hello, ${args.name}!` };
        },
      }),
    );

    context.registerHook({
      event: "before-tool-call",
      handler: async (...args) => {
        context.logger.info("Tool is about to be called");
      },
    });
  },
  async onDeactivate() {
    console.log("Plugin deactivated");
  },
});
```

### 方式二：继承 `BasePlugin` 类

```typescript
import { BasePlugin } from "../plugins/sdk.js";
import type { PluginManifest } from "../plugins/types.js";

const manifest: PluginManifest = {
  name: "my-plugin",
  version: "1.0.0",
  description: "My custom plugin",
  main: "index.js",
};

export default class MyPlugin extends BasePlugin {
  constructor() {
    super(manifest);
  }

  protected async onActivate(): Promise<void> {
    this.getLogger().info("Plugin activated!");

    this.registerTool({
      name: "hello",
      description: "Say hello",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name to greet" },
        },
        required: ["name"],
      },
      execute: async (args) => {
        return { message: `Hello, ${args.name}!` };
      },
    });
  }

  protected async onDeactivate(): Promise<void> {
    this.getLogger().info("Plugin deactivated");
  }
}
```

---

## PluginContext API

插件激活时接收 `PluginContext` 对象，提供以下能力：

### logger

日志记录器，自动添加插件名称前缀。

```typescript
context.logger.info("Information message");
context.logger.warn("Warning message");
context.logger.error("Error message");
context.logger.debug("Debug message");
```

### config

插件配置对象，来自激活时传入的配置。

```typescript
const apiKey = context.config.apiKey as string;
const maxRetries = (context.config.maxRetries as number) ?? 3;
```

### registerTool(tool)

注册自定义工具。

```typescript
context.registerTool({
  name: "weather",
  description: "Get weather information",
  parameters: {
    type: "object",
    properties: {
      city: { type: "string", description: "City name" },
      unit: { type: "string", enum: ["celsius", "fahrenheit"], description: "Temperature unit" },
    },
    required: ["city"],
  },
  execute: async (args) => {
    const city = args.city as string;
    const unit = (args.unit as string) ?? "celsius";
    // 调用天气 API
    return { city, temperature: 25, unit, condition: "sunny" };
  },
});
```

工具注册后，工具的全局标识为 `<plugin-name>:<tool-name>`（如 `my-plugin:weather`），在工具目录中可见。

### registerHook(hook)

注册生命周期钩子。

```typescript
context.registerHook({
  event: "before-tool-call",
  handler: async (toolName, args) => {
    context.logger.info(`Tool ${toolName} is about to be called with: ${JSON.stringify(args)}`);
  },
});
```

### registerRoute(route)

注册自定义 HTTP 路由。

```typescript
context.registerRoute({
  method: "GET",
  path: "/my-plugin/status",
  handler: async (request, reply) => {
    return { status: "ok", plugin: "my-plugin" };
  },
});
```

---

## 生命周期钩子

| 钩子名 | 触发时机 | 参数 |
|--------|----------|------|
| `before-agent-start` | 智能体启动前 | `(session)` |
| `before-tool-call` | 工具调用前 | `(toolName, args)` |
| `after-tool-call` | 工具调用后 | `(toolName, result)` |
| `before-agent-reply` | 智能体回复前 | `(reply)` |
| `reply-dispatch` | 回复分发时 | `(channel, message)` |

---

## 插件生命周期

```
发现 → 加载 → 注册 → 激活 → 运行 → 停用
```

| 阶段 | 说明 | API |
|------|------|-----|
| 发现 | 扫描 `plugins/` 目录 | `GET /api/plugins/discover` |
| 加载 | 读取 `package.json`，加载入口模块 | `POST /api/plugins/install` |
| 注册 | 注册到 PluginRegistry | 自动 |
| 激活 | 调用 `activate(context)` | `POST /api/plugins/:name/activate` |
| 运行 | 工具/钩子/路由生效 | — |
| 停用 | 调用 `deactivate()`，清理资源 | `POST /api/plugins/:name/deactivate` |

---

## 完整示例：天气插件

```typescript
import { definePlugin, createToolDefinition, createHookDefinition } from "../plugins/sdk.js";

export default definePlugin({
  name: "weather-plugin",
  version: "1.0.0",
  description: "Weather information plugin",
  author: "lotte-community",

  async onActivate(context) {
    const apiKey = context.config.apiKey as string;

    context.registerTool(
      createToolDefinition({
        name: "weather",
        description: "Get current weather for a city",
        parameters: {
          type: "object",
          properties: {
            city: { type: "string", description: "City name" },
            unit: {
              type: "string",
              enum: ["celsius", "fahrenheit"],
              description: "Temperature unit",
            },
          },
          required: ["city"],
        },
        execute: async (args) => {
          const city = args.city as string;
          const unit = (args.unit as string) ?? "celsius";

          try {
            const response = await fetch(
              `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${city}`,
            );
            const data = (await response.json()) as {
              current: { temp_c: number; temp_f: number; condition: { text: string } };
            };

            return {
              city,
              temperature: unit === "celsius" ? data.current.temp_c : data.current.temp_f,
              unit,
              condition: data.current.condition.text,
            };
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(`Weather API error: ${msg}`);
          }
        },
      }),
    );

    context.registerHook(
      createHookDefinition({
        event: "before-tool-call",
        handler: async (toolName, args) => {
          if (toolName === "weather") {
            context.logger.info(`Weather query: ${JSON.stringify(args)}`);
          }
        },
      }),
    );

    context.registerRoute({
      method: "GET",
      path: "/weather-plugin/cities",
      handler: async (_request, reply) => {
        return {
          supported: true,
          cities: ["Beijing", "Shanghai", "Guangzhou", "Shenzhen"],
        };
      },
    });

    context.logger.info("Weather plugin activated");
  },

  async onDeactivate() {
    console.log("Weather plugin deactivated");
  },
});
```

---

## 插件管理 API

| 操作 | 方法 | 路径 |
|------|------|------|
| 列出所有插件 | GET | `/api/plugins` |
| 查看活跃插件 | GET | `/api/plugins/active` |
| 发现可用插件 | GET | `/api/plugins/discover` |
| 查看插件详情 | GET | `/api/plugins/:name` |
| 查看插件工具 | GET | `/api/plugins/:name/tools` |
| 安装插件 | POST | `/api/plugins/install` |
| 激活插件 | POST | `/api/plugins/:name/activate` |
| 停用插件 | POST | `/api/plugins/:name/deactivate` |
| 移除插件 | DELETE | `/api/plugins/:name` |

---

## 最佳实践

### 1. 错误处理

工具执行中应捕获异常并返回有意义的错误信息：

```typescript
execute: async (args) => {
  try {
    // 业务逻辑
    return result;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Tool execution failed: ${msg}`);
  }
}
```

### 2. 资源清理

在 `onDeactivate` 中清理所有资源（定时器、连接等）：

```typescript
async onDeactivate() {
  if (this.timer) clearInterval(this.timer);
  if (this.connection) await this.connection.close();
}
```

### 3. 配置验证

在激活时验证必要的配置项：

```typescript
async onActivate(context) {
  const apiKey = context.config.apiKey as string;
  if (!apiKey) {
    throw new Error("apiKey is required in plugin configuration");
  }
}
```

### 4. 日志记录

使用 context.logger 而非 console.log，确保日志统一管理：

```typescript
context.logger.info("Operation completed");
context.logger.error("Operation failed", error);
```

### 5. 工具命名

使用有意义的、不与其他插件冲突的工具名称：

```typescript
// 推荐：使用插件相关的名称
name: "weather"

// 避免：过于通用的名称
name: "search"
```
