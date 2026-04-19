import { LotteApp } from "./app.js";
import { logger } from "./utils/logger.js";

const app = new LotteApp();

async function main(): Promise<void> {
  try {
    await app.start();
  } catch (error) {
    logger.error("Failed to start Lotte Agent", error);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  logger.info("Received SIGINT, shutting down...");
  await app.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down...");
  await app.stop();
  process.exit(0);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", reason);
  process.exit(1);
});

main();
