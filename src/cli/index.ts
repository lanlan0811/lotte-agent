import { Command } from "commander";
import { LotteApp } from "../app.js";
import { logger, type LogLevel } from "../utils/logger.js";
import { resolveStateDir } from "../config/paths.js";
import fs from "node:fs";
import path from "node:path";

const VERSION = "0.1.0";

export function buildCLI(): Command {
  const program = new Command();

  program
    .name("lotte")
    .description("Lotte - 多渠道通用智能体平台")
    .version(VERSION)
    .option("--state-dir <path>", "状态目录路径（默认 ~/.lotte）")
    .option("--log-level <level>", "日志级别（debug/info/warn/error）", "info")
    .option("--no-gateway", "禁用Web网关")
    .option("--no-channels", "禁用消息通道");

  program
    .command("start")
    .description("启动Lotte智能体服务")
    .option("--port <port>", "网关端口", parseInt)
    .option("--host <host>", "网关主机")
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      applyGlobalOptions(globalOpts);

      const app = new LotteApp();
      setupShutdownHandlers(app);

      try {
        await app.start();
        logger.info("Lotte Agent is running. Press Ctrl+C to stop.");
      } catch (error) {
        logger.error("Failed to start Lotte Agent", error);
        process.exit(1);
      }
    });

  program
    .command("stop")
    .description("停止运行中的Lotte智能体服务")
    .action(async () => {
      const pidFile = path.join(resolveStateDir(), "lotte.pid");
      if (!fs.existsSync(pidFile)) {
        console.log("No running Lotte instance found.");
        return;
      }

      try {
        const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
        process.kill(pid, "SIGTERM");
        fs.unlinkSync(pidFile);
        console.log(`Lotte Agent (PID: ${pid}) stopped.`);
      } catch (error) {
        console.error("Failed to stop Lotte Agent:", error);
        if (fs.existsSync(pidFile)) {
          fs.unlinkSync(pidFile);
        }
      }
    });

  program
    .command("status")
    .description("查看Lotte智能体服务状态")
    .action(() => {
      const stateDir = resolveStateDir();
      const pidFile = path.join(stateDir, "lotte.pid");

      console.log(`State directory: ${stateDir}`);
      console.log(`Version: ${VERSION}`);

      if (fs.existsSync(pidFile)) {
        const pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim(), 10);
        try {
          process.kill(pid, 0);
          console.log(`Status: running (PID: ${pid})`);
        } catch {
          console.log("Status: stopped (stale PID file)");
          fs.unlinkSync(pidFile);
        }
      } else {
        console.log("Status: stopped");
      }

      const configDir = path.join(stateDir, "config");
      if (fs.existsSync(configDir)) {
        const configs = fs.readdirSync(configDir).filter((f) => f.endsWith(".json"));
        console.log(`Config files: ${configs.join(", ")}`);
      }
    });

  program
    .command("config")
    .description("配置管理")
    .addCommand(
      new Command("list")
        .description("列出所有配置项")
        .option("--module <module>", "指定模块（ai/gateway/channels/mcp/skills/tools/automation/notification/rag/multimodal/voice）")
        .action(async (opts) => {
          const stateDir = resolveStateDir();
          const configDir = path.join(stateDir, "config");

          if (!fs.existsSync(configDir)) {
            console.log("Config directory not found. Run 'lotte start' first to initialize.");
            return;
          }

          if (opts.module) {
            const configFile = path.join(configDir, `${opts.module}.json`);
            if (fs.existsSync(configFile)) {
              console.log(fs.readFileSync(configFile, "utf-8"));
            } else {
              console.log(`Config file not found: ${opts.module}.json`);
            }
          } else {
            const files = fs.readdirSync(configDir).filter((f) => f.endsWith(".json"));
            for (const file of files) {
              console.log(`\n=== ${file} ===`);
              console.log(fs.readFileSync(path.join(configDir, file), "utf-8"));
            }
          }
        }),
    )
    .addCommand(
      new Command("get")
        .description("获取指定配置项")
        .argument("<module>", "模块名称")
        .argument("[key]", "配置键名（支持点号分隔路径）")
        .action((module, key) => {
          const stateDir = resolveStateDir();
          const configFile = path.join(stateDir, "config", `${module}.json`);

          if (!fs.existsSync(configFile)) {
            console.log(`Config file not found: ${module}.json`);
            return;
          }

          const config = JSON.parse(fs.readFileSync(configFile, "utf-8"));
          if (key) {
            const value = key.split(".").reduce((obj: Record<string, unknown>, k: string) => obj?.[k], config);
            console.log(JSON.stringify(value, null, 2));
          } else {
            console.log(JSON.stringify(config, null, 2));
          }
        }),
    )
    .addCommand(
      new Command("set")
        .description("设置指定配置项")
        .argument("<module>", "模块名称")
        .argument("<key>", "配置键名（支持点号分隔路径）")
        .argument("<value>", "配置值（JSON格式）")
        .action((module, key, value) => {
          const stateDir = resolveStateDir();
          const configFile = path.join(stateDir, "config", `${module}.json`);

          if (!fs.existsSync(configFile)) {
            console.log(`Config file not found: ${module}.json. Run 'lotte start' first.`);
            return;
          }

          const config = JSON.parse(fs.readFileSync(configFile, "utf-8"));
          let parsedValue: unknown;
          try {
            parsedValue = JSON.parse(value);
          } catch {
            parsedValue = value;
          }

          const keys = key.split(".");
          let target = config;
          for (let i = 0; i < keys.length - 1; i++) {
            if (target[keys[i]] === undefined) {
              target[keys[i]] = {};
            }
            target = target[keys[i]];
          }
          target[keys[keys.length - 1]] = parsedValue;

          fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n", "utf-8");
          console.log(`Set ${module}.${key} = ${JSON.stringify(parsedValue)}`);
        }),
    );

  program
    .command("init")
    .description("初始化Lotte配置和目录")
    .option("--force", "强制覆盖已有配置")
    .action(async (opts) => {
      const stateDir = resolveStateDir();
      const configDir = path.join(stateDir, "config");
      const dataDir = path.join(stateDir, "data");
      const soulDir = path.join(stateDir, "soul");
      const memoryDir = path.join(stateDir, "memory");
      const mediaDir = path.join(dataDir, "media");
      const logsDir = path.join(stateDir, "logs");

      const dirs = [configDir, dataDir, soulDir, memoryDir, mediaDir, logsDir];
      for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          console.log(`Created directory: ${dir}`);
        } else {
          console.log(`Directory exists: ${dir}`);
        }
      }

      const defaultConfigs: Record<string, Record<string, unknown>> = {
        "lotte.json": {
          app_name: "lotte",
          version: "1.0.0",
          data_dir: "",
          log_level: "info",
          language: "zh-CN",
          modules: {
            agent: true,
            gateway: true,
            channels: true,
            tools: true,
            skills: true,
            mcp: true,
            automation: true,
            rag: true,
            notification: true,
            multimodal: true,
            voice: true,
            plugins: true,
          },
        },
        "ai.json": {
          default_provider: "openai",
          default_model: "gpt-4o",
          providers: {
            openai: {
              api_url: "https://api.openai.com/v1",
              api_key: "",
              models: { "gpt-4o": { context_window: 128000, max_output: 16384 } },
            },
          },
        },
        "gateway.json": {
          host: "127.0.0.1",
          port: 10623,
          auth: { mode: "none" },
        },
        "channels.json": {
          weixin: { enabled: false },
          qq: { enabled: false },
          feishu: { enabled: false },
        },
        "mcp.json": { clients: {} },
        "skills.json": { schema_version: "skill-manifest.v1", version: 0, skills: {} },
        "tools.json": {
          bash: { enabled: true, require_approval: true },
          file: { enabled: true },
          browser: { enabled: true, headless: true },
          network: { enabled: true },
          git: { enabled: true },
          sandbox: { enabled: true },
        },
      };

      for (const [filename, config] of Object.entries(defaultConfigs)) {
        const filePath = path.join(configDir, filename);
        if (fs.existsSync(filePath) && !opts.force) {
          console.log(`Config exists (skipped): ${filename}`);
          continue;
        }
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");
        console.log(`Created config: ${filename}`);
      }

      const soulFiles: Record<string, string> = {
        "SOUL.md": "# Lotte Soul\n\nYou are Lotte, a helpful and versatile AI assistant.\n\n## Core Traits\n\n- Helpful and knowledgeable\n- Follows instructions precisely\n- Proactive in problem-solving\n",
        "PROFILE.md": "# Lotte Profile\n\n## Identity\n\n- Name: Lotte\n- Role: Universal AI Assistant\n- Language: Chinese (Primary), English (Secondary)\n\n## Capabilities\n\n- Multi-channel communication\n- Task automation\n- Code development\n- Document analysis\n",
        "AGENTS.md": "# Lotte Agents\n\n## Default Agent\n\n- Model: gpt-4o\n- Max turns: 25\n- Tools: all enabled\n",
      };

      for (const [filename, content] of Object.entries(soulFiles)) {
        const filePath = path.join(soulDir, filename);
        if (fs.existsSync(filePath) && !opts.force) {
          console.log(`Soul file exists (skipped): ${filename}`);
          continue;
        }
        fs.writeFileSync(filePath, content, "utf-8");
        console.log(`Created soul file: ${filename}`);
      }

      console.log("\nInitialization complete!");
      console.log(`State directory: ${stateDir}`);
      console.log("\nNext steps:");
      console.log("  1. Edit AI configuration: lotte config set ai providers.openai.api_key \"your-api-key\"");
      console.log("  2. Start the agent: lotte start");
    });

  program
    .command("gateway")
    .description("网关管理")
    .addCommand(
      new Command("start")
        .description("启动网关服务")
        .option("--port <port>", "网关端口", parseInt)
        .option("--host <host>", "网关主机")
        .option("--web", "启用Web UI")
        .option("--web-root <path>", "Web UI静态资源目录")
        .action(async (opts, cmd) => {
          const globalOpts = cmd.optsWithGlobals();
          applyGlobalOptions(globalOpts);

          const app = new LotteApp();
          setupShutdownHandlers(app);

          try {
            await app.start();

            if (opts.web) {
              const configLoader = app.getConfig();
              const gatewayConfig = { ...configLoader.getGateway() };
              gatewayConfig.web = {
                ...gatewayConfig.web,
                enabled: true,
                root: opts.webRoot || gatewayConfig.web?.root || "",
              };
              await configLoader.saveGateway(gatewayConfig);
              logger.info("Web UI enabled");
            }

            if (opts.port) {
              const configLoader = app.getConfig();
              const gatewayConfig = { ...configLoader.getGateway(), port: opts.port };
              if (opts.host) gatewayConfig.host = opts.host;
              await configLoader.saveGateway(gatewayConfig);
            }

            logger.info("Lotte Gateway is running. Press Ctrl+C to stop.");
          } catch (error) {
            logger.error("Failed to start Lotte Gateway", error);
            process.exit(1);
          }
        }),
    )
    .addCommand(
      new Command("status")
        .description("查看网关状态")
        .action(async () => {
          try {
            const stateDir = resolveStateDir();
            const configFile = path.join(stateDir, "config", "gateway.json");
            if (!fs.existsSync(configFile)) {
              console.log("Gateway config not found. Run 'lotte init' first.");
              return;
            }
            const config = JSON.parse(fs.readFileSync(configFile, "utf-8"));
            console.log(`Host: ${config.host || "127.0.0.1"}`);
            console.log(`Port: ${config.port || 10623}`);
            console.log(`Auth mode: ${config.auth?.mode || "none"}`);
            console.log(`Web UI: ${config.web?.enabled ? "enabled" : "disabled"}`);
            if (config.web?.enabled) {
              console.log(`Web UI root: ${config.web.root || "(auto-detect)"}`);
            }
          } catch (error) {
            console.error("Failed to get gateway status:", error);
          }
        }),
    );

  program
    .command("chat")
    .description("启动交互式对话")
    .option("--model <model>", "指定AI模型")
    .option("--session <id>", "继续已有会话")
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      applyGlobalOptions(globalOpts);

      const app = new LotteApp();
      try {
        await app.start();
      } catch (error) {
        logger.error("Failed to start for chat mode", error);
        process.exit(1);
      }

      const session = app.createSession({ model: opts.model });
      console.log(`\nLotte Chat (session: ${session.id})`);
      console.log("Type 'exit' or Ctrl+C to quit.\n");

      const readline = await import("node:readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const prompt = (): void => {
        rl.question("You: ", async (input) => {
          const trimmed = input.trim();
          if (!trimmed || trimmed.toLowerCase() === "exit") {
            rl.close();
            await app.stop();
            return;
          }

          try {
            const result = await app.chat(session.id, trimmed);
            console.log(`\nLotte: ${result.response}\n`);
          } catch (error) {
            console.error(`Error: ${error}`);
          }

          prompt();
        });
      };

      prompt();

      rl.on("close", async () => {
        await app.stop();
      });
    });

  program
    .command("mcp")
    .description("MCP客户端管理")
    .addCommand(
      new Command("list")
        .description("列出已配置的MCP客户端")
        .action(() => {
          const stateDir = resolveStateDir();
          const mcpConfigFile = path.join(stateDir, "config", "mcp.json");

          if (!fs.existsSync(mcpConfigFile)) {
            console.log("MCP config not found. Run 'lotte init' first.");
            return;
          }

          const config = JSON.parse(fs.readFileSync(mcpConfigFile, "utf-8"));
          const clients = config.clients ?? {};

          if (Object.keys(clients).length === 0) {
            console.log("No MCP clients configured.");
            return;
          }

          for (const [name, clientConfig] of Object.entries(clients)) {
            const cfg = clientConfig as Record<string, unknown>;
            console.log(`  ${name}: ${cfg.transport ?? "unknown"} (${cfg.enabled === false ? "disabled" : "enabled"})`);
          }
        }),
    )
    .addCommand(
      new Command("add")
        .description("添加MCP客户端")
        .argument("<name>", "客户端名称")
        .option("--transport <type>", "传输类型（stdio/http/sse）", "stdio")
        .option("--command <cmd>", "启动命令（stdio）")
        .option("--url <url>", "服务URL（http/sse）")
        .option("--args <args>", "命令参数（JSON数组）")
        .option("--env <env>", "环境变量（JSON对象）")
        .option("--disabled", "添加但禁用")
        .action((name, opts) => {
          const stateDir = resolveStateDir();
          const mcpConfigFile = path.join(stateDir, "config", "mcp.json");

          if (!fs.existsSync(mcpConfigFile)) {
            console.log("MCP config not found. Run 'lotte init' first.");
            return;
          }

          const config = JSON.parse(fs.readFileSync(mcpConfigFile, "utf-8"));
          if (!config.clients) config.clients = {};

          if (config.clients[name]) {
            console.log(`MCP client '${name}' already exists. Remove it first.`);
            return;
          }

          const clientEntry: Record<string, unknown> = {
            transport: opts.transport,
            enabled: !opts.disabled,
          };

          if (opts.transport === "stdio") {
            clientEntry.command = opts.command ?? "";
            if (opts.args) {
              try {
                clientEntry.args = JSON.parse(opts.args);
              } catch {
                console.error("Invalid args JSON format");
                return;
              }
            }
          } else {
            clientEntry.url = opts.url ?? "";
          }

          if (opts.env) {
            try {
              clientEntry.env = JSON.parse(opts.env);
            } catch {
              console.error("Invalid env JSON format");
              return;
            }
          }

          config.clients[name] = clientEntry;
          fs.writeFileSync(mcpConfigFile, JSON.stringify(config, null, 2) + "\n", "utf-8");
          console.log(`Added MCP client: ${name}`);
        }),
    )
    .addCommand(
      new Command("remove")
        .description("移除MCP客户端")
        .argument("<name>", "客户端名称")
        .action((name) => {
          const stateDir = resolveStateDir();
          const mcpConfigFile = path.join(stateDir, "config", "mcp.json");

          if (!fs.existsSync(mcpConfigFile)) {
            console.log("MCP config not found.");
            return;
          }

          const config = JSON.parse(fs.readFileSync(mcpConfigFile, "utf-8"));
          if (!config.clients?.[name]) {
            console.log(`MCP client '${name}' not found.`);
            return;
          }

          delete config.clients[name];
          fs.writeFileSync(mcpConfigFile, JSON.stringify(config, null, 2) + "\n", "utf-8");
          console.log(`Removed MCP client: ${name}`);
        }),
    );

  program
    .command("skill")
    .description("技能管理")
    .addCommand(
      new Command("list")
        .description("列出已安装的技能")
        .action(() => {
          const stateDir = resolveStateDir();
          const skillsConfigFile = path.join(stateDir, "config", "skills.json");

          if (!fs.existsSync(skillsConfigFile)) {
            console.log("Skills config not found. Run 'lotte init' first.");
            return;
          }

          const config = JSON.parse(fs.readFileSync(skillsConfigFile, "utf-8"));
          const skills = config.skills ?? {};

          if (Object.keys(skills).length === 0) {
            console.log("No skills installed.");
            return;
          }

          for (const [name, skillConfig] of Object.entries(skills)) {
            const cfg = skillConfig as Record<string, unknown>;
            console.log(`  ${name}: v${cfg.version ?? "unknown"} - ${cfg.description ?? ""}`);
          }
        }),
    );

  return program;
}

function applyGlobalOptions(opts: Record<string, unknown>): void {
  if (opts.stateDir) {
    process.env.LOTTE_STATE_DIR = opts.stateDir as string;
  }

  if (opts.logLevel) {
    logger.setLevel(opts.logLevel as LogLevel);
  }
}

function setupShutdownHandlers(app: LotteApp): void {
  const shutdown = async (): Promise<void> => {
    logger.info("Shutting down...");
    await app.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", error);
    void app.stop().then(() => process.exit(1));
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection", reason);
    void app.stop().then(() => process.exit(1));
  });
}

export async function runCLI(): Promise<void> {
  const program = buildCLI();
  await program.parseAsync(process.argv);
}
