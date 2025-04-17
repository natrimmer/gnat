import { FSWatcher, watch } from "chokidar";
import * as liveServer from "live-server";
import path from "path";
import { SiteConfig } from "src/config/SiteConfig";
import { getLogger } from "../utils/logger";
import { Builder } from "./Builder";

export class DevServer {
  private static watcher: FSWatcher | null = null;
  private readonly logger = getLogger();
  private readonly serverConfig = {
    port: 8080,
    host: "localhost",
    root: "./public",
    open: true,
    file: "index.html",
    wait: 100,
    logLevel: 0 as 0 | 1 | 2 | undefined,
    ignore: "^.*/\\.",
    mount: [],
    middleware: [],
  };

  constructor(
    private readonly builder: Builder,
    private readonly config: SiteConfig,
  ) {
    this.logger.debug("DevServer instance created", {
      port: this.serverConfig.port,
      host: this.serverConfig.host,
      root: this.serverConfig.root,
    });
  }

  async start(): Promise<void> {
    this.logger.info("Starting development server...");

    try {
      this.logger.debug("Initiating initial build");
      await this.builder.build();
      this.logger.info("Initial build completed successfully");

      liveServer.start(this.serverConfig);
      this.logger.debug("Live server started with config", this.serverConfig);

      const srcDir = path.join(__dirname, "..", "..", "src");
      this.logger.debug("Initializing file watcher for directory", { srcDir });
      DevServer.watcher = this.initializeWatcher(srcDir);

      this.logger.info(
        `Development server started at http://${this.serverConfig.host}:${this.serverConfig.port}`,
      );
    } catch (error) {
      this.logger.warn("Failed to start development server", { error });
      throw error;
    }
  }

  private initializeWatcher(srcDir: string): FSWatcher {
    this.logger.debug("Setting up file watcher", {
      directory: srcDir,
      ignoredPatterns: [
        /(^|[\/\\])\../,
        "**/node_modules/**",
        "**/public/**",
        "**/*.git/**",
      ],
    });

    const watcher = watch([srcDir], {
      ignored: [
        /(^|[\/\\])\../,
        "**/node_modules/**",
        "**/public/**",
        "**/*.git/**",
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    watcher
      .on("add", (path) => {
        this.logger.debug("File added event received", { path });
        this.handleFileChange(path);
      })
      .on("change", (path) => {
        this.logger.debug("File change event received", { path });
        this.handleFileChange(path);
      })
      .on("unlink", (path) => {
        this.logger.debug("File deletion event received", { path });
        this.handleFileChange(path);
      })
      .on("error", (error) => {
        this.logger.warn("File watcher encountered an error", { error });
      });

    this.logger.info("File watcher initialized successfully");
    return watcher;
  }

  private async handleFileChange(filepath: string): Promise<void> {
    const srcDir = path.join(__dirname, "..", "..", "src");
    const relativePath = path.relative(srcDir, filepath);

    this.logger.info(`File change detected: ${relativePath}`);

    try {
      this.logger.debug("Triggering rebuild due to file change", { filepath });
      await this.builder.build();
      this.logger.info("Build completed successfully after file change");
    } catch (error) {
      this.logger.warn("Build failed after file change", { error, filepath });
      throw error;
    }
  }

  static async cleanup(): Promise<void> {
    const logger = getLogger();
    logger.info("Initiating shutdown sequence");

    try {
      if (DevServer.watcher) {
        logger.debug("Closing file watcher");
        await DevServer.watcher.close();
        logger.info("File watcher closed successfully");
      } else {
        logger.debug("No file watcher instance to close");
      }

      // Give time for any pending operations to complete
      logger.debug("Waiting for pending operations to complete");
      await new Promise((resolve) => setTimeout(resolve, 100));

      logger.info("Shutdown completed successfully");
      process.exit(0);
    } catch (error) {
      logger.warn("Error during shutdown sequence", { error });
      process.exit(1);
    }
  }
}
