import fs from "fs/promises";
import path from "path";
import { SiteConfig } from "../config/SiteConfig";
import { BaseContentHandler } from "../core/ContentHandler";
import { generateTree } from "../utils/tree";

export class PageHandler extends BaseContentHandler {
  private readonly SKIP_FILES = [
    "feed.html",
    "notes.html",
    "articles.html",
    "changelog.html",
  ];
  private readonly SKIP_PATHS = ["feed", "articles", "notes"];

  constructor(config: SiteConfig) {
    super(config, "pages");
    this.logger.debug("PageHandler initialized");
  }

  async process(): Promise<void> {
    this.logger.info("Starting page processing");

    try {
      const contentDir = this.config.getContentPath("");
      this.logger.debug("Scanning content directory", { contentDir });

      const files = await this.getAllContentFiles(contentDir);
      this.logger.info(`Found ${files.length} HTML files to process`);

      await Promise.all(
        files.map(async (file) => {
          const basename = path.basename(file);

          if (this.SKIP_FILES.includes(basename)) {
            this.logger.debug("Skipping content type root file", {
              file: basename,
            });
            return;
          }

          this.logger.debug("Processing page", { file });
          await this.processPage(file);
        }),
      );

      this.logger.info("Completed page processing");
    } catch (error) {
      this.logger.warn("Failed to process pages", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async processPage(filePath: string): Promise<void> {
    this.logger.debug("Processing page file", { filePath });

    try {
      const content = await this.templateProcessor.processContent(filePath);
      const relativePath = path.relative(
        this.config.getContentPath(""),
        filePath,
      );

      if (!content.template) {
        this.logger.debug("Skipping file without template", { filePath });
        return;
      }

      let outputPath;
      if (path.basename(relativePath) === "index.html") {
        outputPath = this.config.getOutputPath("", relativePath);
        this.logger.debug("Processing index file", {
          relativePath,
          outputPath,
        });
      } else {
        const dirname = path.basename(relativePath, ".html");

        // Check if this is a content item rather than a page
        if (
          this.SKIP_PATHS.some((skip) =>
            relativePath.includes(path.join(skip, "")),
          )
        ) {
          this.logger.debug("Skipping content item", {
            relativePath,
            type: this.SKIP_PATHS.find((skip) =>
              relativePath.includes(path.join(skip, "")),
            ),
          });
          return;
        }

        outputPath = this.config.getOutputPath("", dirname, "index.html");
        this.logger.debug("Processing regular page", {
          relativePath,
          outputPath,
        });
      }

      await this.templateProcessor.generatePage(content, outputPath);
      this.logger.info("Generated page", { outputPath });

      if (path.basename(filePath) === "sitemap.html") {
        this.logger.debug("Processing sitemap");
        await this.processSitemap(outputPath);
      }
    } catch (error) {
      this.logger.warn("Failed to process page", {
        filePath,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async processSitemap(outputPath: string): Promise<void> {
    this.logger.debug("Starting sitemap processing", { outputPath });

    try {
      const content = await fs.readFile(outputPath, "utf-8");

      this.logger.debug("Generating sitemap tree");
      const treeOutput = await this.generateSitemapTree();

      const updatedContent = content.replace(
        "<!-- COMMAND_OUTPUT -->",
        treeOutput.trim(),
      );

      await fs.writeFile(outputPath, updatedContent);
      this.logger.info("Successfully generated sitemap", { outputPath });
    } catch (error) {
      this.logger.warn("Failed to generate sitemap tree", {
        outputPath,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async generateSitemapTree(): Promise<string> {
    const outputPath = this.config.getOutputPath("");
    this.logger.debug("Generating site tree", { outputPath });
    return generateTree(outputPath);
  }

  private async getAllContentFiles(dir: string): Promise<string[]> {
    this.logger.debug("Starting content file scan", { directory: dir });
    const files: string[] = [];

    async function scan(directory: string) {
      const entries = await fs.readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.name.endsWith(".html")) {
          files.push(fullPath);
        }
      }
    }

    try {
      await scan(dir);
      this.logger.debug("Completed content file scan", {
        fileCount: files.length,
      });
      return files;
    } catch (error) {
      this.logger.warn("Failed to scan content files", {
        directory: dir,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }
}
