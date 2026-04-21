import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { LotteApp } from "../app.js";
import { logger } from "../utils/logger.js";

export interface GatewayLauncherOptions {
  port?: number;
  host?: string;
  web?: boolean;
  prod?: boolean;
  webPort?: number;
  stateDir?: string;
  logLevel?: string;
}

export class GatewayLauncher {
  private app: LotteApp | null = null;
  private webProcess: ChildProcess | null = null;
  private options: GatewayLauncherOptions;
  private shuttingDown = false;

  constructor(options: GatewayLauncherOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.options.prod) {
      await this.startProd();
    } else if (this.options.web) {
      await this.startDev();
    } else {
      await this.startGatewayOnly();
    }
  }

  private async startGatewayOnly(): Promise<void> {
    logger.info("Starting Lotte Gateway (API only)...");
    this.app = new LotteApp();
    this.registerShutdown();
    await this.app.start();
    logger.info("Lotte Gateway is running. Press Ctrl+C to stop.");
  }

  private async startDev(): Promise<void> {
    logger.info("Starting Lotte Gateway in development mode (API + Web dev server)...");
    this.app = new LotteApp();
    this.registerShutdown();
    await this.app.start();

    this.startWebDevServer();

    logger.info("Lotte Gateway (dev) is running. Press Ctrl+C to stop.");
  }

  private async startProd(): Promise<void> {
    const webDir = path.resolve(
      import.meta.dirname,
      "../../dist/web",
    );

    if (!fs.existsSync(webDir)) {
      logger.error(
        `Web static directory not found: ${webDir}. Run 'pnpm build:web' first.`,
      );
      process.exit(1);
    }

    logger.info("Starting Lotte Gateway in production mode (API + embedded Web)...");
    this.app = new LotteApp();
    this.app.setServeStatic(true);
    this.registerShutdown();
    await this.app.start();
    logger.info("Lotte Gateway (prod) is running. Press Ctrl+C to stop.");
  }

  private startWebDevServer(): void {
    const webDir = this.resolveWebDir();
    if (!webDir) {
      logger.warn("Web directory not found, skipping dev server startup.");
      return;
    }

    const webPort = this.options.webPort ?? 3000;

    logger.info(`Starting Next.js dev server on port ${webPort}...`);

    this.webProcess = spawn(
      "npx",
      ["next", "dev", "--port", String(webPort)],
      {
        cwd: webDir,
        stdio: "pipe",
        shell: true,
        env: {
          ...process.env,
          FORCE_COLOR: "1",
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
      logger.error(`Web dev server error: ${err.message}`);
    });

    this.webProcess.on("exit", (code, signal) => {
      if (!this.shuttingDown) {
        logger.warn(`Web dev server exited (code=${code}, signal=${signal})`);
      }
    });

    logger.info(`Web dev server started at http://127.0.0.1:${webPort}`);
  }

  private resolveWebDir(): string | null {
    const candidates = [
      path.resolve(import.meta.dirname, "../../web"),
      path.resolve(process.cwd(), "web"),
    ];

    for (const dir of candidates) {
      if (fs.existsSync(path.join(dir, "package.json"))) {
        return dir;
      }
    }

    return null;
  }

  async stop(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    logger.info("Shutting down Gateway Launcher...");

    if (this.webProcess) {
      logger.info("Stopping Web dev server...");
      this.webProcess.kill("SIGTERM");

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.webProcess?.kill("SIGKILL");
          resolve();
        }, 5000);

        this.webProcess.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });

        if (this.webProcess.killed) {
          clearTimeout(timeout);
          resolve();
        }
      });

      this.webProcess = null;
    }

    if (this.app) {
      await this.app.stop();
      this.app = null;
    }

    logger.info("Gateway Launcher stopped.");
  }

  private registerShutdown(): void {
    const shutdown = async (): Promise<void> => {
      await this.stop();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception", error);
      void this.stop().then(() => process.exit(1));
    });

    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled rejection", reason);
      void this.stop().then(() => process.exit(1));
    });
  }
}
