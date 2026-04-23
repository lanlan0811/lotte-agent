import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { LotteApp } from "../app.js";
import { logger, type LogLevel } from "../utils/logger.js";

export interface GatewayLauncherOptions {
  host: string;
  port: number;
  webDev: boolean;
  prod: boolean;
  stateDir: string;
  logLevel: string;
}

export class GatewayLauncher {
  private app: LotteApp | null = null;
  private webProcess: ChildProcess | null = null;
  private shuttingDown = false;

  async start(opts: GatewayLauncherOptions): Promise<void> {
    logger.setLevel(opts.logLevel as LogLevel);

    this.app = new LotteApp();
    this.registerShutdownHandlers();

    try {
      if (opts.webDev) {
        const gatewayConfig = this.app.getConfig().getGateway();
        gatewayConfig.web = {
          ...gatewayConfig.web,
          enabled: true,
          root: gatewayConfig.web?.root || "",
        };
        await this.app.getConfig().saveGateway(gatewayConfig);
      }

      if (opts.prod) {
        const gatewayConfig = this.app.getConfig().getGateway();
        gatewayConfig.web = {
          ...gatewayConfig.web,
          enabled: true,
          root: gatewayConfig.web?.root || resolveProdWebRoot(),
        };
        await this.app.getConfig().saveGateway(gatewayConfig);
      }

      await this.app.start();
      logger.info(`Gateway started on http://${opts.host}:${opts.port}`);

      if (opts.webDev) {
        this.startWebDevServer(opts);
      }

      if (opts.prod && !opts.webDev) {
        const webRoot = resolveProdWebRoot();
        const fs = await import("node:fs");
        if (!fs.existsSync(webRoot)) {
          logger.warn(
            `Web static directory not found: ${webRoot}. Run 'cd web && npm run build' first.`,
          );
        } else {
          logger.info(`Serving Web UI from: ${webRoot}`);
        }
      }
    } catch (error) {
      logger.error(`Gateway start failed: ${error}`);
      await this.cleanup();
      process.exit(1);
    }
  }

  private startWebDevServer(opts: GatewayLauncherOptions): void {
    const webDir = resolveWebDir();
    const fs = require("node:fs") as typeof import("node:fs");

    if (!fs.existsSync(webDir)) {
      logger.error(`Web directory not found: ${webDir}`);
      return;
    }

    const webPort = 3000;
    const apiPort = opts.port;

    logger.info(`Starting Web dev server on http://localhost:${webPort}`);
    logger.info(`API proxy: /api/* -> http://127.0.0.1:${apiPort}/api/*`);

    this.webProcess = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["next", "dev", "--port", String(webPort)],
      {
        cwd: webDir,
        stdio: "pipe",
        env: {
          ...process.env,
          LOTTE_API_PORT: String(apiPort),
          LOTTE_API_HOST: opts.host,
        },
      },
    );

    this.webProcess.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        logger.info(`[Web] ${line}`);
      }
    });

    this.webProcess.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        logger.info(`[Web] ${line}`);
      }
    });

    this.webProcess.on("error", (err) => {
      logger.error(`Web dev server error: ${err}`);
    });

    this.webProcess.on("exit", (code) => {
      if (!this.shuttingDown) {
        logger.warn(`Web dev server exited with code ${code}`);
      }
    });

    logger.info(`Web UI available at http://localhost:${webPort}`);
  }

  private registerShutdownHandlers(): void {
    const shutdown = async (): Promise<void> => {
      if (this.shuttingDown) return;
      this.shuttingDown = true;
      logger.info("Shutting down...");
      await this.cleanup();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }

  private async cleanup(): Promise<void> {
    if (this.webProcess) {
      logger.info("Stopping Web dev server...");
      this.webProcess.kill("SIGTERM");
      this.webProcess = null;
    }

    if (this.app) {
      await this.app.stop();
      this.app = null;
    }
  }
}

function resolveWebDir(): string {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "web"),
    path.join(cwd, "Web"),
  ];

  for (const candidate of candidates) {
    try {
      const fs = require("node:fs") as typeof import("node:fs");
      if (fs.existsSync(path.join(candidate, "package.json"))) {
        return candidate;
      }
    } catch {
      // continue
    }
  }

  return path.join(cwd, "web");
}

function resolveProdWebRoot(): string {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, "web", "out"),
    path.join(cwd, "Web", "out"),
    path.resolve(process.argv[1] ?? cwd, "..", "web", "out"),
  ];

  for (const candidate of candidates) {
    try {
      const fs = require("node:fs") as typeof import("node:fs");
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // continue
    }
  }

  return path.join(cwd, "web", "out");
}
