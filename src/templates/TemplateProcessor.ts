import fs from "fs/promises";
import path from "path";
import { SiteConfig } from "../config/SiteConfig";
import { getLogger } from "../utils/logger";
import { PageData } from "./types";

export class TemplateProcessor {
  private readonly logger = getLogger();

  constructor(private readonly config: SiteConfig) {
    this.logger.debug("TemplateProcessor initialized", {
      componentsDir: this.config.componentsDir,
    });
  }

  async processContent(filePath: string): Promise<PageData> {
    this.logger.debug("Processing content file", { filePath });

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const pageData = await this.parseMetadata(content);

      this.logger.info("Content processed successfully", {
        filePath,
        template: pageData.template,
      });

      return pageData;
    } catch (error) {
      this.logger.warn("Failed to process content", {
        filePath,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  async generatePage(data: PageData, outputPath: string): Promise<void> {
    this.logger.debug("Generating page", {
      template: data.template,
      outputPath,
    });

    try {
      const template = await this.findComponent(data.template);
      this.logger.debug("Found template component");

      let finalContent = template
        .replace("<!-- TITLE -->", data.title || "")
        .replace("<!-- CONTENT -->", data.content);

      this.logger.debug("Processing includes in content");
      finalContent = await this.processIncludes(finalContent);

      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, finalContent);

      this.logger.info("Page generated successfully", { outputPath });
    } catch (error) {
      this.logger.warn("Failed to generate page", {
        outputPath,
        template: data.template,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async parseMetadata(content: string): Promise<PageData> {
    this.logger.debug("Parsing metadata from content", {
      contentLength: content.length,
    });

    const data: PageData = {
      content: content.trim(),
      template: "",
    };

    try {
      const metadataPattern = /<!--\s*(\w+):\s*([^>]*?)\s*-->/g;
      let match;
      const matches: { start: number; end: number }[] = [];

      while ((match = metadataPattern.exec(content)) !== null) {
        const [fullMatch, key, value] = match;
        const dataKey = key === "extends" ? "template" : key;
        data[dataKey] = value;

        matches.push({
          start: match.index,
          end: match.index + fullMatch.length,
        });

        this.logger.debug("Found metadata", {
          key: dataKey,
          value,
        });
      }

      this.logger.debug("Removing metadata tags", {
        matchCount: matches.length,
      });

      data.content = content;
      for (const position of matches.reverse()) {
        data.content =
          data.content.slice(0, position.start) +
          data.content.slice(position.end);
      }

      data.content = data.content.trim();
      this.logger.debug("Metadata parsing completed", {
        hasTemplate: Boolean(data.template),
        contentLength: data.content.length,
      });

      return data;
    } catch (error) {
      this.logger.warn("Error parsing metadata", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  async findComponent(name: string): Promise<string> {
    this.logger.debug("Finding component", { name });

    const directPath = path.join(this.config.componentsDir, `${name}.html`);

    try {
      if (name === "footer") {
        this.logger.debug("Processing footer component");
        const footerContent = await fs.readFile(directPath, "utf-8");
        const lastBuildDate = new Date().toDateString();
        return footerContent.replace("<!-- LAST_UPDATED -->", lastBuildDate);
      }

      if (name === "version") {
        this.logger.debug("Processing version component");
        const versionContent = await fs.readFile(directPath, "utf-8");
        const packageJson = await fs.readFile("./package.json", "utf-8");
        const version = JSON.parse(packageJson).version;
        this.logger.debug("Retrieved version number", { version });
        return versionContent.replace("<!-- VERSION_NUMBER -->", version);
      }

      const content = await fs.readFile(directPath, "utf-8");
      this.logger.debug("Found component in direct path", { directPath });
      return content;
    } catch (error) {
      this.logger.debug(
        "Component not found in direct path, searching subdirectories",
        {
          directPath,
        },
      );

      try {
        const entries = await fs.readdir(this.config.componentsDir, {
          withFileTypes: true,
        });

        for (const entry of entries) {
          if (entry.isDirectory()) {
            const subPath = path.join(
              this.config.componentsDir,
              entry.name,
              `${name}.html`,
            );

            try {
              const content = await fs.readFile(subPath, "utf-8");
              this.logger.debug("Found component in subdirectory", { subPath });
              return content;
            } catch {
              this.logger.debug("Component not found in subdirectory", {
                subPath,
              });
              continue;
            }
          }
        }

        this.logger.warn("Component not found in any location", { name });
        throw new Error(`Component not found: ${name}`);
      } catch (error) {
        this.logger.warn("Error searching for component", {
          name,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    }
  }

  private async processIncludes(content: string): Promise<string> {
    this.logger.debug("Processing includes", {
      contentLength: content.length,
    });

    const includeRegex = /<!--\s*INCLUDE:(\w+(?:-\w+)*)\s*-->/g;
    const processedIncludes = new Set<string>();

    const processIncludesRecursive = async (
      content: string,
    ): Promise<string> => {
      let result = content;
      const matches = Array.from(content.matchAll(includeRegex));

      this.logger.debug("Found includes to process", {
        count: matches.length,
      });

      for (const match of matches) {
        const componentName = match[1];

        if (processedIncludes.has(componentName)) {
          this.logger.warn("Circular include detected", { componentName });
          throw new Error(`Circular include detected: ${componentName}`);
        }

        this.logger.debug("Processing include", {
          componentName,
          processedCount: processedIncludes.size,
        });

        processedIncludes.add(componentName);

        const componentContent = await this.findComponent(componentName);
        const processedComponent =
          await processIncludesRecursive(componentContent);

        result = result.replace(match[0], processedComponent);

        processedIncludes.delete(componentName);
        this.logger.debug("Include processed", { componentName });
      }

      return result;
    };

    try {
      const result = await processIncludesRecursive(content);
      this.logger.info("Includes processing completed", {
        originalLength: content.length,
        processedLength: result.length,
      });
      return result;
    } catch (error) {
      this.logger.warn("Error processing includes", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }
}
