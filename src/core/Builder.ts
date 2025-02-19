import { SiteConfig } from "../config/SiteConfig";
import { cleanDirectory } from "../utils/fs";
import { getLogger } from "../utils/logger";
import { ContentHandlerFactory } from "./HandlerFactory";

export class Builder {
  private readonly logger = getLogger();

  constructor(private readonly config: SiteConfig) {}

  async build(): Promise<void> {
    this.logger.info("Starting build process");
    this.logger.debug(
      `Build configuration: ${JSON.stringify(
        {
          srcDir: this.config.getContentPath(""),
          outDir: this.config.getOutputPath(""),
          includeDrafts: this.config.includeDrafts,
          clean: this.config.clean,
        },
        null,
        2,
      )}`,
    );

    try {
      if (this.config.clean) {
        this.logger.info("Cleaning output directory");
        await cleanDirectory(this.config.getOutputPath(""));
        this.logger.debug("Output directory cleaned");
      }

      // Process all content types and regular pages
      const contentTypes = ["articles", "feed", "notes", "changelog", "pages"];
      this.logger.info(`Processing content types: ${contentTypes.join(", ")}`);

      const startTime = Date.now();
      await Promise.all(
        contentTypes.map(async (type) => {
          this.logger.debug(`Initializing handler for ${type}`);
          const handler = ContentHandlerFactory.getHandler(type);

          const typeStartTime = Date.now();
          try {
            await handler.process();
            const processingTime = Date.now() - typeStartTime;
            this.logger.debug(
              `Completed processing ${type} in ${processingTime}ms`,
            );
          } catch (error) {
            this.logger.warn(`Error processing ${type}: ${error}`);
            throw error; // Re-throw to trigger overall build failure
          }
        }),
      );

      const totalTime = Date.now() - startTime;
      this.logger.info(`Build completed successfully in ${totalTime}ms`);

      // Log draft status
      if (this.config.includeDrafts) {
        this.logger.warn("Draft content was included in this build");
      } else {
        this.logger.debug("Draft content was excluded from this build");
      }
    } catch (error) {
      this.logger.error("Build failed:", error);
      throw error;
    }
  }
}
