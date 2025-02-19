import { SiteConfig } from "./config/SiteConfig";
import { BuildOptions } from "./config/types";
import { Builder } from "./core/Builder";
import { DevServer } from "./core/DevServer";
import { initLogger } from "./utils/logger";

const isDev = process.argv.includes("--watch");
const useFileLogging = process.argv.includes("--log-file");
const logger = initLogger(useFileLogging);

async function main() {
  try {
    const config = SiteConfig.initialize({
      includeDrafts: isDev,
    } as BuildOptions);

    const builder = new Builder(config);

    if (isDev) {
      const devServer = new DevServer(builder, config);
      await devServer.start();
    } else {
      await builder.build();
    }
  } catch (error) {
    logger.error("Application failed:", error);
    process.exit(1);
  }
}

// Set up signal handlers
process.on("SIGINT", () => DevServer.cleanup());
process.on("SIGTERM", () => DevServer.cleanup());
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception:", error);
  DevServer.cleanup();
});
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection:", reason);
  DevServer.cleanup();
});

main().catch(console.error);
