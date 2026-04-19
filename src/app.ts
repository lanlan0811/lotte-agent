import { ConfigLoader } from "./config/loader.js";
import { ConfigWatcher } from "./config/watcher.js";
import { TemplateGenerator } from "./config/templates.js";
import { Database } from "./db/database.js";
import { ErrorDumper } from "./errors/dumper.js";
import { ModelManager } from "./ai/model-manager.js";
import { PromptBuilder } from "./soul/prompt-builder.js";
import { SoulLoader } from "./soul/soul-loader.js";
import { MemoryManager } from "./memory/memory-manager.js";
import { ContextCompactor } from "./memory/compactor.js";
import { InMemoryMemory } from "./memory/short-term.js";
import { ReActEngine } from "./agent/react-engine.js";
import { ToolInvoker } from "./agent/tool-invoker.js";
import { Session } from "./agent/session.js";
import { HookSystem, CompactionHook, BootGuidanceHook, MemoryGuidanceHook } from "./hooks/index.js";
import { ToolRegistry, ToolPolicyPipeline, registerAllTools, auditLog } from "./tools/index.js";
import { ApprovalSystem } from "./security/approval.js";
import { VMSandbox } from "./security/sandbox.js";
import { Gateway } from "./gateway/index.js";
import { MCPClientManager } from "./mcp/manager.js";
import { MCPConfigWatcher } from "./mcp/watcher.js";
import { SkillManager } from "./skills/manager.js";
import { PluginRegistry, PluginLoader } from "./plugins/index.js";
import { ChannelManager } from "./channels/manager.js";
import { ConsoleChannel } from "./channels/console/channel.js";
import { WeixinChannel } from "./channels/weixin/channel.js";
import { QQChannel } from "./channels/qq/channel.js";
import { FeishuChannel } from "./channels/feishu/channel.js";
import { AutomationManager } from "./automation/manager.js";
import { logger } from "./utils/logger.js";

export class LotteApp {
  private config: ConfigLoader | null = null;
  private configWatcher: ConfigWatcher | null = null;
  private db: Database | null = null;
  private errorDumper: ErrorDumper | null = null;
  private modelManager: ModelManager | null = null;
  private promptBuilder: PromptBuilder | null = null;
  private soulLoader: SoulLoader | null = null;
  private memoryManager: MemoryManager | null = null;
  private compactor: ContextCompactor | null = null;
  private hookSystem: HookSystem | null = null;
  private toolRegistry: ToolRegistry | null = null;
  private toolPolicy: ToolPolicyPipeline | null = null;
  private approvalSystem: ApprovalSystem | null = null;
  private sandbox: VMSandbox | null = null;
  private gateway: Gateway | null = null;
  private mcpManager: MCPClientManager | null = null;
  private mcpWatcher: MCPConfigWatcher | null = null;
  private skillManager: SkillManager | null = null;
  private pluginRegistry: PluginRegistry | null = null;
  private pluginLoader: PluginLoader | null = null;
  private channelManager: ChannelManager | null = null;
  private automationManager: AutomationManager | null = null;
  private sessions: Map<string, Session> = new Map();
  private running = false;

  async start(): Promise<void> {
    logger.info("Lotte Agent starting...");

    this.config = new ConfigLoader();
    await this.config.load();

    const mainConfig = this.config.getMain();
    logger.setLevel(mainConfig.log_level);

    const templateGenerator = new TemplateGenerator({
      configDir: this.config.getPaths().configDir,
      soulDir: this.config.getPaths().soulDir,
    });
    templateGenerator.generateAll();

    this.db = new Database(this.config.getPaths().dataDir);
    this.db.initialize();

    this.errorDumper = new ErrorDumper(this.config.getPaths().dumpsDir);

    const aiConfig = this.config.getAI();
    this.modelManager = new ModelManager(aiConfig);

    this.soulLoader = new SoulLoader(this.config.getPaths().soulDir);
    this.promptBuilder = new PromptBuilder({
      soulDir: this.config.getPaths().soulDir,
    });

    this.memoryManager = new MemoryManager({
      dataDir: this.config.getPaths().dataDir,
      shortTermMaxTokens: this.modelManager.getContextWindow(aiConfig.default_model),
    });
    this.memoryManager.initialize();

    this.compactor = new ContextCompactor(this.modelManager);

    this.hookSystem = new HookSystem();
    this.hookSystem.register(new CompactionHook());
    this.hookSystem.register(new BootGuidanceHook("You are Lotte, a helpful AI assistant. Follow your SOUL and AGENTS guidelines."));
    this.hookSystem.register(new MemoryGuidanceHook(""));

    this.toolRegistry = new ToolRegistry();
    registerAllTools(this.toolRegistry);

    this.toolPolicy = new ToolPolicyPipeline();
    this.toolPolicy.addRule({
      name: "deny_dangerous_fs",
      type: "require_approval",
      toolPattern: ["exec", "browser_execute"],
    });
    this.toolPolicy.addRule({
      name: "allow_read_tools",
      type: "allow",
      toolPattern: ["read", "list_dir", "code_search", "code_analyze", "audit_query", "audit_stats"],
    });

    this.approvalSystem = new ApprovalSystem({
      requestTimeout: 60000,
    });

    this.sandbox = new VMSandbox();

    this.mcpManager = new MCPClientManager();
    const mcpConfig = this.config.getMCP();
    try {
      await this.mcpManager.initFromConfig(mcpConfig);
    } catch (error) {
      logger.warn(`MCP initialization error: ${error}`);
    }

    this.mcpWatcher = new MCPConfigWatcher(
      this.mcpManager,
      () => this.config?.getMCP() ?? null,
      { pollInterval: 3000 },
    );
    this.mcpWatcher.start();

    this.skillManager = new SkillManager({
      dataDir: this.config.getPaths().dataDir,
      configDir: this.config.getPaths().configDir,
    });
    this.skillManager.initialize();

    this.pluginRegistry = new PluginRegistry();
    this.pluginLoader = new PluginLoader(this.config.getPaths().dataDir + "/plugins");

    const discoveredPlugins = this.pluginLoader.discoverPlugins();
    for (const manifest of discoveredPlugins) {
      try {
        const plugin = await this.pluginLoader.loadPlugin(manifest);
        this.pluginRegistry.register(manifest.name, plugin);
        logger.info(`Discovered plugin: ${manifest.name} v${manifest.version}`);
      } catch (error) {
        logger.warn(`Failed to load plugin '${manifest.name}': ${error}`);
      }
    }

    this.channelManager = new ChannelManager(
      async (message) => {
        try {
          const result = await this.chat(message.sessionId, this.extractTextFromMessage(message));
          if (result) {
            const { ChannelResponse } = await import("./channels/types.js");
            return {
              toHandle: message.sessionId,
              content: [{ type: "text" as const, text: result.response ?? "" }],
            };
          }
          return null;
        } catch (error) {
          logger.error(`Channel process error: ${error}`);
          return {
            toHandle: message.sessionId,
            content: [{ type: "text" as const, text: "Sorry, an error occurred while processing your message." }],
          };
        }
      },
    );

    const consoleChannel = new ConsoleChannel(async (msg) => {
      try {
        const result = await this.chat(msg.sessionId, this.extractTextFromMessage(msg));
        if (result) {
          return {
            toHandle: msg.sessionId,
            content: [{ type: "text" as const, text: result.response ?? "" }],
          };
        }
        return null;
      } catch (error) {
        logger.error(`Console channel process error: ${error}`);
        return {
          toHandle: msg.sessionId,
          content: [{ type: "text" as const, text: "Sorry, an error occurred." }],
        };
      }
    });
    this.channelManager.register(consoleChannel);

    const channelsConfig = this.config.getChannels();

    if (channelsConfig.weixin.enabled) {
      const weixinChannel = new WeixinChannel(
        async (msg) => {
          try {
            const result = await this.chat(msg.sessionId, this.extractTextFromMessage(msg));
            return result ? { toHandle: msg.sessionId, content: [{ type: "text" as const, text: result.response ?? "" }] } : null;
          } catch { return null; }
        },
        channelsConfig.weixin,
      );
      this.channelManager.register(weixinChannel);
    }

    if (channelsConfig.qq.enabled) {
      const qqChannel = new QQChannel(
        async (msg) => {
          try {
            const result = await this.chat(msg.sessionId, this.extractTextFromMessage(msg));
            return result ? { toHandle: msg.sessionId, content: [{ type: "text" as const, text: result.response ?? "" }] } : null;
          } catch { return null; }
        },
        channelsConfig.qq,
      );
      this.channelManager.register(qqChannel);
    }

    if (channelsConfig.feishu.enabled) {
      const feishuChannel = new FeishuChannel(
        async (msg) => {
          try {
            const result = await this.chat(msg.sessionId, this.extractTextFromMessage(msg));
            return result ? { toHandle: msg.sessionId, content: [{ type: "text" as const, text: result.response ?? "" }] } : null;
          } catch { return null; }
        },
        channelsConfig.feishu,
      );
      this.channelManager.register(feishuChannel);
    }

    await this.channelManager.startAll();

    this.automationManager = new AutomationManager({
      chat: async (sessionId, text) => {
        try {
          return await this.chat(sessionId, text);
        } catch (error) {
          logger.error(`Automation chat error: ${error}`);
          return null;
        }
      },
      sendChannelMessage: async (channelId, toHandle, text) => {
        try {
          await this.channelManager?.sendCrossChannel(channelId, toHandle, text);
        } catch (error) {
          logger.error(`Automation channel send error: ${error}`);
        }
      },
    });

    await this.automationManager.start();

    const gatewayConfig = this.config.getGateway();
    this.gateway = new Gateway({
      app: this,
      config: gatewayConfig,
      pluginRegistry: this.pluginRegistry,
      pluginLoader: this.pluginLoader,
    });
    await this.gateway.start();

    this.configWatcher = new ConfigWatcher(this.config);
    this.configWatcher.start();

    this.config.onChange((configName) => {
      if (configName === "main") {
        const newMainConfig = this.config!.getMain();
        logger.setLevel(newMainConfig.log_level);
      }
      if (configName === "ai") {
        logger.info("AI configuration changed, reloading model manager...");
        const newAiConfig = this.config!.getAI();
        this.modelManager = new ModelManager(newAiConfig);
      }
    });

    this.running = true;
    logger.info("Lotte Agent started successfully");
  }

  async stop(): Promise<void> {
    if (!this.running) return;

    logger.info("Lotte Agent stopping...");

    for (const session of this.sessions.values()) {
      session.abort();
    }
    this.sessions.clear();

    if (this.gateway) {
      await this.gateway.stop();
      this.gateway = null;
    }

    if (this.mcpWatcher) {
      this.mcpWatcher.stop();
      this.mcpWatcher = null;
    }

    if (this.mcpManager) {
      await this.mcpManager.closeAll();
      this.mcpManager = null;
    }

    if (this.skillManager) {
      this.skillManager.shutdown();
      this.skillManager = null;
    }

    if (this.pluginRegistry) {
      await this.pluginRegistry.deactivateAll();
      this.pluginRegistry = null;
    }

    this.pluginLoader = null;

    if (this.channelManager) {
      await this.channelManager.stopAll();
      this.channelManager = null;
    }

    if (this.automationManager) {
      await this.automationManager.stop();
      this.automationManager = null;
    }

    if (this.configWatcher) {
      this.configWatcher.stop();
      this.configWatcher = null;
    }

    if (this.db) {
      this.db.close();
      this.db = null;
    }

    this.running = false;
    logger.info("Lotte Agent stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  getConfig(): ConfigLoader {
    if (!this.config) throw new Error("App not started");
    return this.config;
  }

  getDatabase(): Database {
    if (!this.db) throw new Error("App not started");
    return this.db;
  }

  getErrorDumper(): ErrorDumper {
    if (!this.errorDumper) throw new Error("App not started");
    return this.errorDumper;
  }

  getModelManager(): ModelManager {
    if (!this.modelManager) throw new Error("App not started");
    return this.modelManager;
  }

  getPromptBuilder(): PromptBuilder {
    if (!this.promptBuilder) throw new Error("App not started");
    return this.promptBuilder;
  }

  getSoulLoader(): SoulLoader {
    if (!this.soulLoader) throw new Error("App not started");
    return this.soulLoader;
  }

  getMemoryManager(): MemoryManager {
    if (!this.memoryManager) throw new Error("App not started");
    return this.memoryManager;
  }

  getCompactor(): ContextCompactor {
    if (!this.compactor) throw new Error("App not started");
    return this.compactor;
  }

  getHookSystem(): HookSystem {
    if (!this.hookSystem) throw new Error("App not started");
    return this.hookSystem;
  }

  getToolRegistry(): ToolRegistry {
    if (!this.toolRegistry) throw new Error("App not started");
    return this.toolRegistry;
  }

  getToolPolicy(): ToolPolicyPipeline {
    if (!this.toolPolicy) throw new Error("App not started");
    return this.toolPolicy;
  }

  getApprovalSystem(): ApprovalSystem {
    if (!this.approvalSystem) throw new Error("App not started");
    return this.approvalSystem;
  }

  getSandbox(): VMSandbox {
    if (!this.sandbox) throw new Error("App not started");
    return this.sandbox;
  }

  getGateway(): Gateway {
    if (!this.gateway) throw new Error("Gateway not started");
    return this.gateway;
  }

  getMCPManager(): MCPClientManager | null {
    return this.mcpManager;
  }

  getSkillManager(): SkillManager | null {
    return this.skillManager;
  }

  getPluginRegistry(): PluginRegistry | null {
    return this.pluginRegistry;
  }

  getPluginLoader(): PluginLoader | null {
    return this.pluginLoader;
  }

  getChannelManager(): ChannelManager | null {
    return this.channelManager;
  }

  getAutomationManager(): AutomationManager | null {
    return this.automationManager;
  }

  private extractTextFromMessage(message: import("./channels/types.js").ChannelMessage): string {
    const texts: string[] = [];
    for (const c of message.content) {
      if (c.type === "text") texts.push(c.text);
    }
    return texts.join("\n");
  }

  createSession(options?: { model?: string; maxTurns?: number }): Session {
    const session = new Session({
      model: options?.model ?? this.modelManager?.getDefaultModel(),
      maxTurns: options?.maxTurns ?? 25,
      systemPrompt: this.promptBuilder?.build(),
    });
    this.sessions.set(session.id, session);
    logger.info(`Created session: ${session.id}`);
    return session;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  async chat(sessionId: string, message: string): Promise<import("./agent/react-engine.js").ReActResult> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    if (!session.isActive()) throw new Error(`Session is not active: ${sessionId}`);

    if (!this.modelManager || !this.memoryManager || !this.compactor || !this.toolRegistry) {
      throw new Error("App not fully initialized");
    }

    const toolInvoker = new ToolInvoker();

    for (const tool of this.toolRegistry.listAll()) {
      toolInvoker.register({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters.shape as Record<string, unknown>,
        execute: async (args: Record<string, unknown>) => {
          const startTime = Date.now();
          try {
            const result = await tool.execute(args);
            auditLog.record({
              sessionId,
              toolName: tool.name,
              action: "execute",
              args,
              result: "success",
              durationMs: Date.now() - startTime,
            });
            return result;
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            auditLog.record({
              sessionId,
              toolName: tool.name,
              action: "execute",
              args,
              result: "failure",
              durationMs: Date.now() - startTime,
              metadata: { error: errorMsg },
            });
            throw error;
          }
        },
      });
    }

    const memory = new InMemoryMemory();

    const engine = new ReActEngine({
      modelManager: this.modelManager,
      toolInvoker,
      memory,
      compactor: this.compactor,
    });

    return engine.run(session, message);
  }
}
