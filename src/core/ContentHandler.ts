import fs from "fs/promises";
import { SiteConfig } from "../config/SiteConfig";
import { TemplateProcessor } from "../templates/TemplateProcessor";
import { getLogger } from "../utils/logger";

export interface ContentHandler {
  process(): Promise<void>;
}

export abstract class BaseContentHandler implements ContentHandler {
  protected readonly logger = getLogger();
  protected readonly templateProcessor: TemplateProcessor;

  constructor(
    protected readonly config: SiteConfig,
    protected readonly contentType: string,
  ) {
    this.templateProcessor = new TemplateProcessor(config);
    this.logger.debug(`Initialized ${contentType} handler`);
  }

  abstract process(): Promise<void>;

  protected async getContentFiles(): Promise<string[]> {
    const contentPath = this.config.getContentPath(this.contentType);
    this.logger.debug(`Reading content files from: ${contentPath}`);

    const files = await this.readDir(contentPath);
    const filteredFiles = files
      .filter(
        (file) =>
          file.endsWith(".html") &&
          (this.config.includeDrafts || !file.startsWith("draft_")),
      )
      .sort((a, b) => b.localeCompare(a));

    const draftCount = files.filter((file) => file.startsWith("draft_")).length;
    if (draftCount > 0) {
      if (this.config.includeDrafts) {
        this.logger.info(
          `Including ${draftCount} draft files in ${this.contentType}`,
        );
      } else {
        this.logger.debug(
          `Skipping ${draftCount} draft files in ${this.contentType}`,
        );
      }
    }

    this.logger.debug(
      `Found ${filteredFiles.length} content files for ${this.contentType}`,
    );
    return filteredFiles;
  }

  protected async generatePaginatedContent(
    items: string[],
    currentPage: number,
    totalPages: number,
    contentTemplate: string,
    footerTemplate: string,
    nextLinkTemplate: string,
    prevLinkTemplate: string,
    options: {
      rowsPlaceholder: string;
      prevLinkPlaceholder: string;
      nextLinkPlaceholder: string;
      baseUrl: string;
    },
    itemsPerPage: number,
  ): Promise<string> {
    this.logger.debug(
      `Generating pagination for ${this.contentType}: page ${currentPage}/${totalPages}`,
    );

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = items.slice(startIndex, endIndex);

    this.logger.debug(
      `Page ${currentPage}: showing items ${startIndex + 1} to ${Math.min(endIndex, items.length)}`,
    );

    let content = contentTemplate.replace(
      options.rowsPlaceholder,
      paginatedItems.join("\n"),
    );

    // Add footer with pagination
    let footer = footerTemplate
      .replace("<!-- CURRENT_PAGE -->", currentPage.toString())
      .replace("<!-- TOTAL_PAGES -->", totalPages.toString());

    // Add navigation links
    const prevPagePath = this.getPrevPagePath(currentPage, options.baseUrl);
    const nextPagePath = this.getNextPagePath(
      currentPage,
      totalPages,
      options.baseUrl,
    );

    if (prevPagePath) {
      this.logger.debug(`Adding previous page link to: ${prevPagePath}`);
      footer = footer.replace(
        options.prevLinkPlaceholder,
        prevLinkTemplate
          .replace("<!-- PATH -->", prevPagePath)
          .replace("<!-- COLOR -->", this.getColorOption()),
      );
    }

    if (nextPagePath) {
      this.logger.debug(`Adding next page link to: ${nextPagePath}`);
      footer = footer.replace(
        options.nextLinkPlaceholder,
        nextLinkTemplate
          .replace("<!-- PATH -->", nextPagePath)
          .replace("<!-- COLOR -->", this.getColorOption()),
      );
    }

    const finalContent = content.replace("<!-- FOOTER -->", footer);
    this.logger.debug(
      `Completed pagination generation for ${this.contentType} page ${currentPage}`,
    );

    return finalContent;
  }

  protected getColorOption(): string {
    const colors = ["mondrian_yellow", "mondrian_red", "mondrian_blue"];
    const color = colors[Math.floor(Math.random() * colors.length)];
    this.logger.debug(`Selected color: ${color}`);
    return color;
  }

  private getPrevPagePath(currentPage: number, baseUrl: string): string {
    if (currentPage <= 1) return "";
    const path =
      currentPage === 2 ? baseUrl : `${baseUrl}page/${currentPage - 1}/`;
    this.logger.debug(`Generated previous page path: ${path || "none"}`);
    return path;
  }

  private getNextPagePath(
    currentPage: number,
    totalPages: number,
    baseUrl: string,
  ): string {
    const path =
      currentPage < totalPages ? `${baseUrl}page/${currentPage + 1}/` : "";
    this.logger.debug(`Generated next page path: ${path || "none"}`);
    return path;
  }

  private async readDir(dir: string): Promise<string[]> {
    try {
      const files = await fs.readdir(dir);
      this.logger.debug(`Successfully read directory: ${dir}`);
      return files;
    } catch (error) {
      this.logger.error(`Error reading directory ${dir}:`, error);
      if (error instanceof Error && error.message.includes("ENOENT")) {
        this.logger.warn(`Directory does not exist: ${dir}`);
      }
      return [];
    }
  }
}
