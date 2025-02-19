import path from "path";
import { SiteConfig } from "../config/SiteConfig";
import { BaseContentHandler } from "../core/ContentHandler";
import { PageData } from "../templates/types";

export class FeedHandler extends BaseContentHandler {
  private readonly ITEMS_PER_PAGE = 20;

  constructor(config: SiteConfig) {
    super(config, "feed");
    this.logger.debug("FeedHandler initialized", {
      itemsPerPage: this.ITEMS_PER_PAGE,
    });
  }

  async process(): Promise<void> {
    this.logger.info("Starting feed processing");

    try {
      const files = await this.getContentFiles();
      this.logger.debug("Retrieved feed files", { count: files.length });

      const feedItems = await this.processFeedItems(files);
      this.logger.info(`Processed ${feedItems.length} feed items successfully`);

      await this.generatePaginatedPages(feedItems);
      this.logger.info("Generated paginated feed pages");
    } catch (error) {
      this.logger.warn("Failed to process feed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async processFeedItems(files: string[]): Promise<string[]> {
    this.logger.debug("Starting feed item processing", {
      fileCount: files.length,
    });

    try {
      const [feedTableRowTemplate, feedItemTemplate] = await Promise.all([
        this.templateProcessor.findComponent("feed-table-row"),
        this.templateProcessor.findComponent("feed-item"),
      ]);

      this.logger.debug("Retrieved feed templates");

      return Promise.all(
        files.map(async (file) => {
          this.logger.debug("Processing feed file", { file });

          const contentPath = path.join(
            this.config.getContentPath("feed"),
            file,
          );
          const content =
            await this.templateProcessor.processContent(contentPath);

          const feedId = path.basename(file, ".html");
          const link = `/feed/${feedId}/`;

          this.logger.debug("Processing feed item", {
            feedId,
            title: content.title,
            hasBluesky: Boolean(content.bluesky),
          });

          await this.generateIndividualFeedPage(
            content,
            feedId,
            feedItemTemplate,
          );

          const tableRow = await this.generateFeedTableRow(
            content,
            link,
            feedTableRowTemplate,
          );

          return tableRow;
        }),
      );
    } catch (error) {
      this.logger.warn("Error processing feed items", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async generateIndividualFeedPage(
    content: PageData,
    feedId: string,
    feedItemTemplate: string,
  ): Promise<void> {
    this.logger.debug("Generating individual feed page", {
      feedId,
      title: content.title,
    });

    try {
      const wrappedContent = feedItemTemplate
        .replace("<!-- DATE -->", content.date || "")
        .replace("<!-- TITLE -->", content.title || "Untitled")
        .replace("<!-- CONTENT -->", content.content || "");

      const outputPath = this.config.getOutputPath(
        "feed",
        feedId,
        "index.html",
      );

      await this.templateProcessor.generatePage(
        {
          content: wrappedContent,
          template: "base",
          title: content.title,
        } as PageData,
        outputPath,
      );

      this.logger.info("Generated feed page", {
        feedId,
        outputPath,
      });
    } catch (error) {
      this.logger.warn("Failed to generate individual feed page", {
        feedId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async generateFeedTableRow(
    content: PageData,
    link: string,
    template: string,
  ): Promise<string> {
    this.logger.debug("Generating feed table row", {
      title: content.title,
      hasBluesky: Boolean(content.bluesky),
    });

    try {
      let blueskyLink = "";
      if (content.bluesky) {
        const blueskyTemplate =
          await this.templateProcessor.findComponent("bluesky-link");
        blueskyLink = blueskyTemplate.replace("<!-- LINK -->", content.bluesky);
        this.logger.debug("Added Bluesky link to feed item", {
          link: content.bluesky,
        });
      }

      return Object.entries({
        "<!-- DATE -->": content.date || "",
        "<!-- CONTENT -->": content.content || "",
        "<!-- PATH -->": link,
        "<!-- BLUESKY -->": blueskyLink,
      }).reduce(
        (template, [placeholder, value]) =>
          template.replace(placeholder, value),
        template,
      );
    } catch (error) {
      this.logger.warn("Error generating feed table row", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async generatePaginatedPages(feedItems: string[]): Promise<void> {
    const totalPages = Math.ceil(feedItems.length / this.ITEMS_PER_PAGE);
    this.logger.debug("Starting feed pagination generation", {
      totalItems: feedItems.length,
      totalPages,
      itemsPerPage: this.ITEMS_PER_PAGE,
    });

    try {
      // Load the base feed page template
      const feedPagePath = path.join(
        this.config.getContentPath(""),
        "feed.html",
      );
      this.logger.debug("Loading feed page template", { path: feedPagePath });
      const feedPageContent =
        await this.templateProcessor.processContent(feedPagePath);

      const [
        feedTableTemplate,
        footerTemplate,
        nextLinkTemplate,
        prevLinkTemplate,
      ] = await Promise.all([
        this.templateProcessor.findComponent("feed-table"),
        this.templateProcessor.findComponent("feed-table-footer"),
        this.templateProcessor.findComponent("table-next-link"),
        this.templateProcessor.findComponent("table-prev-link"),
      ]);

      this.logger.debug("Retrieved pagination templates");

      for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
        this.logger.debug("Generating feed page", {
          currentPage,
          totalPages,
        });

        const paginatedTable = await this.generatePaginatedContent(
          feedItems,
          currentPage,
          totalPages,
          feedTableTemplate,
          footerTemplate,
          nextLinkTemplate,
          prevLinkTemplate,
          {
            rowsPlaceholder: "<!-- FEED_ROWS -->",
            prevLinkPlaceholder: "<!-- FEED_TABLE_PREV_LINK -->",
            nextLinkPlaceholder: "<!-- FEED_TABLE_NEXT_LINK -->",
            baseUrl: "/feed/",
          },
          this.ITEMS_PER_PAGE,
        );

        // Replace the table placeholder in the base content
        const fullContent = feedPageContent.content.replace(
          "<!-- FEED_TABLE -->",
          paginatedTable,
        );

        const outputPath =
          currentPage === 1
            ? this.config.getOutputPath("feed", "index.html")
            : this.config.getOutputPath(
                "feed",
                "page",
                currentPage.toString(),
                "index.html",
              );

        await this.templateProcessor.generatePage(
          {
            content: fullContent,
            template: feedPageContent.template,
            title: feedPageContent.title,
          },
          outputPath,
        );

        this.logger.info("Generated feed page", {
          pageNumber: currentPage,
          outputPath,
        });
      }
    } catch (error) {
      this.logger.warn("Failed to generate paginated feed pages", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }
}
