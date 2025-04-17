import path from "path";
import { SiteConfig } from "../config/SiteConfig";
import { BaseContentHandler } from "../core/ContentHandler";
import { PageData } from "../templates/types";

export class ArticlesHandler extends BaseContentHandler {
  private readonly ITEMS_PER_PAGE = 20;

  constructor(config: SiteConfig) {
    super(config, "articles");
    this.logger.debug("ArticlesHandler initialized", {
      itemsPerPage: this.ITEMS_PER_PAGE,
    });
  }

  async process(): Promise<void> {
    this.logger.info("Starting articles processing");

    try {
      const files = await this.getContentFiles();
      this.logger.debug("Retrieved content files", { count: files.length });

      const articles = await this.processArticles(files);
      this.logger.info(`Processed ${articles.length} articles successfully`);

      await this.generatePaginatedPages(articles);
      this.logger.info("Generated paginated article pages");
    } catch (error) {
      this.logger.warn("Failed to process articles", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async processArticles(files: string[]): Promise<string[]> {
    this.logger.debug("Starting article processing", {
      fileCount: files.length,
    });

    try {
      const [articleTableRowTemplate, articleItemTemplate] = await Promise.all([
        this.templateProcessor.findComponent("article-table-row"),
        this.templateProcessor.findComponent("article-item"),
      ]);

      this.logger.debug("Retrieved article templates");

      return Promise.all(
        files.map(async (file) => {
          this.logger.debug("Processing article file", { file });

          const contentPath = path.join(
            this.config.getContentPath("articles"),
            file,
          );
          const content =
            await this.templateProcessor.processContent(contentPath);

          const articleId = path.basename(file, ".html");
          const link = `/articles/${articleId}/`;

          await this.generateIndividualArticlePage(
            content,
            articleId,
            articleItemTemplate,
          );
          this.logger.debug("Generated individual article page", { articleId });

          const tableRow = articleTableRowTemplate
            .replace("<!-- DATE -->", content.date || "")
            .replace("<!-- TITLE -->", content.title || "Untitled")
            .replace("<!-- PATH -->", link);

          return tableRow;
        }),
      );
    } catch (error) {
      this.logger.warn("Error processing articles", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async generateIndividualArticlePage(
    content: PageData,
    articleId: string,
    articleItemTemplate: string,
  ): Promise<void> {
    this.logger.debug("Generating individual article page", {
      articleId,
      title: content.title,
    });

    try {
      let updated = "";
      if (content.updated) {
        const updateTemplate =
          await this.templateProcessor.findComponent("update");
        updated = updateTemplate.replace("<!-- UPDATED -->", content.updated);
        this.logger.debug("Added update information to article", {
          articleId,
          updated: content.updated,
        });
      }

      const wrappedContent = articleItemTemplate
        .replace("<!-- DATE -->", content.date || "")
        .replace("<!-- UPDATE -->", updated)
        .replace("<!-- TITLE -->", content.title || "Untitled")
        .replace("<!-- CONTENT -->", content.content || "");

      const outputPath = this.config.getOutputPath(
        "articles",
        articleId,
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

      this.logger.info("Successfully generated article page", {
        articleId,
        outputPath,
      });
    } catch (error) {
      this.logger.warn("Failed to generate individual article page", {
        articleId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async generatePaginatedPages(articles: string[]): Promise<void> {
    const totalPages = Math.ceil(articles.length / this.ITEMS_PER_PAGE);
    this.logger.debug("Starting pagination generation", {
      totalArticles: articles.length,
      totalPages,
      itemsPerPage: this.ITEMS_PER_PAGE,
    });

    try {
      // Load the base articles page template
      const articlesPagePath = path.join(
        this.config.getContentPath(""),
        "articles.html",
      );
      this.logger.debug("Loading articles page template", {
        path: articlesPagePath,
      });
      const articlesPageContent =
        await this.templateProcessor.processContent(articlesPagePath);

      const [
        articleTableTemplate,
        footerTemplate,
        nextLinkTemplate,
        prevLinkTemplate,
      ] = await Promise.all([
        this.templateProcessor.findComponent("article-table"),
        this.templateProcessor.findComponent("article-table-footer"),
        this.templateProcessor.findComponent("table-next-link"),
        this.templateProcessor.findComponent("table-prev-link"),
      ]);

      this.logger.debug("Retrieved pagination templates");

      for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
        this.logger.debug("Generating page", {
          currentPage,
          totalPages,
        });

        const paginatedTable = await this.generatePaginatedContent(
          articles,
          currentPage,
          totalPages,
          articleTableTemplate,
          footerTemplate,
          nextLinkTemplate,
          prevLinkTemplate,
          {
            rowsPlaceholder: "<!-- ARTICLE_ROWS -->",
            prevLinkPlaceholder: "<!-- ARTICLE_TABLE_PREV_LINK -->",
            nextLinkPlaceholder: "<!-- ARTICLE_TABLE_NEXT_LINK -->",
            baseUrl: "/articles/",
          },
          this.ITEMS_PER_PAGE,
        );

        // Replace the table placeholder in the base content
        const fullContent = articlesPageContent.content.replace(
          "<!-- ARTICLE_TABLE -->",
          paginatedTable,
        );

        const outputPath =
          currentPage === 1
            ? this.config.getOutputPath("articles", "index.html")
            : this.config.getOutputPath(
                "articles",
                "page",
                currentPage.toString(),
                "index.html",
              );

        await this.templateProcessor.generatePage(
          {
            content: fullContent,
            template: articlesPageContent.template,
            title: articlesPageContent.title,
          },
          outputPath,
        );

        this.logger.info("Generated paginated page", {
          pageNumber: currentPage,
          outputPath,
        });
      }
    } catch (error) {
      this.logger.warn("Failed to generate paginated pages", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }
}
