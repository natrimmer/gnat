import path from "path";
import { SiteConfig } from "../config/SiteConfig";
import { BaseContentHandler } from "../core/ContentHandler";

export class ChangelogHandler extends BaseContentHandler {
  private readonly ITEMS_PER_PAGE = 20;

  constructor(config: SiteConfig) {
    super(config, "changelog");
    this.logger.debug("ChangelogHandler initialized", {
      itemsPerPage: this.ITEMS_PER_PAGE,
    });
  }

  async process(): Promise<void> {
    this.logger.info("Starting changelog processing");

    try {
      const files = await this.getContentFiles();
      this.logger.debug("Retrieved changelog files", { count: files.length });

      const entries = await this.processChangelogEntries(files);
      this.logger.info(
        `Processed ${entries.length} changelog entries successfully`,
      );

      await this.generatePaginatedPages(entries);
      this.logger.info("Generated paginated changelog pages");
    } catch (error) {
      this.logger.warn("Failed to process changelog", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async processChangelogEntries(files: string[]): Promise<string[]> {
    this.logger.debug("Starting changelog entry processing", {
      fileCount: files.length,
    });

    try {
      const [changelogTableRowTemplate, changelogTableLinkTemplate] =
        await Promise.all([
          this.templateProcessor.findComponent("changelog-table-row"),
          this.templateProcessor.findComponent("changelog-table-link"),
        ]);

      this.logger.debug("Retrieved changelog templates");

      return Promise.all(
        files.map(async (file) => {
          this.logger.debug("Processing changelog file", { file });

          const contentPath = path.join(
            this.config.getContentPath("changelog"),
            file,
          );
          const content =
            await this.templateProcessor.processContent(contentPath);

          const version = content.version || "";
          const date = content.date || "";
          const contentText = content.content || "";
          const link = content.link || "";

          this.logger.debug("Processing changelog entry", {
            version,
            date,
            hasLink: Boolean(link),
          });

          let rowContent = changelogTableRowTemplate
            .replace("<!-- VERSION -->", version)
            .replace("<!-- DATE -->", date)
            .replace("<!-- CHANGES -->", contentText);

          if (link) {
            const linkHtml = changelogTableLinkTemplate
              .replace("<!-- LINK -->", link)
              .replace("<!-- VERSION -->", version)
              .replace("<!-- COLOR -->", this.getColorOption());
            rowContent = rowContent.replace("<!-- LINK -->", linkHtml);

            this.logger.debug("Added link to changelog entry", {
              version,
              link,
            });
          }

          return rowContent;
        }),
      );
    } catch (error) {
      this.logger.warn("Error processing changelog entries", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async generatePaginatedPages(entries: string[]): Promise<void> {
      const totalPages = Math.ceil(entries.length / this.ITEMS_PER_PAGE);
      this.logger.debug("Starting changelog pagination generation", {
        totalEntries: entries.length,
        totalPages,
        itemsPerPage: this.ITEMS_PER_PAGE,
      });

      try {
        // Load the base changelog page template
        const changelogPagePath = path.join(this.config.getContentPath(""), "changelog.html");
        this.logger.debug("Loading changelog page template", { path: changelogPagePath });
        const changelogPageContent = await this.templateProcessor.processContent(changelogPagePath);

        const [
          changelogTableTemplate,
          footerTemplate,
          nextLinkTemplate,
          prevLinkTemplate,
        ] = await Promise.all([
          this.templateProcessor.findComponent("changelog-table"),
          this.templateProcessor.findComponent("changelog-table-footer"),
          this.templateProcessor.findComponent("table-next-link"),
          this.templateProcessor.findComponent("table-prev-link"),
        ]);

        this.logger.debug("Retrieved pagination templates");

        for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
          this.logger.debug("Generating changelog page", {
            currentPage,
            totalPages,
          });

          const paginatedTable = await this.generatePaginatedContent(
            entries,
            currentPage,
            totalPages,
            changelogTableTemplate,
            footerTemplate,
            nextLinkTemplate,
            prevLinkTemplate,
            {
              rowsPlaceholder: "<!-- ROWS -->",
              prevLinkPlaceholder: "<!-- PREV_LINK -->",
              nextLinkPlaceholder: "<!-- NEXT_LINK -->",
              baseUrl: "/changelog/",
            },
            this.ITEMS_PER_PAGE,
          );

          // Replace the table placeholder in the base content
          const fullContent = changelogPageContent.content.replace(
            "<!-- CHANGELOG_TABLE -->",
            paginatedTable
          );

          const outputPath =
            currentPage === 1
              ? this.config.getOutputPath("changelog", "index.html")
              : this.config.getOutputPath(
                  "changelog",
                  "page",
                  currentPage.toString(),
                  "index.html",
                );

          await this.templateProcessor.generatePage(
            {
              content: fullContent,
              template: changelogPageContent.template,
              title: changelogPageContent.title
            },
            outputPath,
          );

          this.logger.info("Generated changelog page", {
            pageNumber: currentPage,
            outputPath,
          });
        }
      } catch (error) {
        this.logger.warn("Failed to generate paginated changelog pages", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    }
}
