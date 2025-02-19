import path from "path";
import { SiteConfig } from "../config/SiteConfig";
import { BaseContentHandler } from "../core/ContentHandler";
import { PageData } from "../templates/types";

export class NotesHandler extends BaseContentHandler {
  private readonly ITEMS_PER_PAGE = 20;

  constructor(config: SiteConfig) {
    super(config, "notes");
    this.logger.debug("NotesHandler initialized", {
      itemsPerPage: this.ITEMS_PER_PAGE,
    });
  }

  async process(): Promise<void> {
    this.logger.info("Starting notes processing");

    try {
      const files = await this.getContentFiles();
      this.logger.debug("Retrieved note files", { count: files.length });

      const notes = await this.processNotes(files);
      this.logger.info(`Processed ${notes.length} notes successfully`);

      await this.generatePaginatedPages(notes);
      this.logger.info("Generated paginated note pages");
    } catch (error) {
      this.logger.warn("Failed to process notes", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async processNotes(files: string[]): Promise<string[]> {
    this.logger.debug("Starting note processing", { fileCount: files.length });

    try {
      const [articleTableRowTemplate, articleItemTemplate] = await Promise.all([
        this.templateProcessor.findComponent("article-table-row"),
        this.templateProcessor.findComponent("article-item"),
      ]);

      this.logger.debug("Retrieved note templates");

      return Promise.all(
        files.map(async (file) => {
          this.logger.debug("Processing note file", { file });

          const contentPath = path.join(
            this.config.getContentPath("notes"),
            file,
          );
          const content =
            await this.templateProcessor.processContent(contentPath);

          const noteId = path.basename(file, ".html");
          const link = `/notes/${noteId}/`;

          this.logger.debug("Processing note", {
            noteId,
            title: content.title,
            hasUpdate: Boolean(content.updated),
          });

          await this.generateIndividualNotePage(
            content,
            noteId,
            articleItemTemplate,
          );

          const tableRow = articleTableRowTemplate
            .replace("<!-- DATE -->", content.date || "")
            .replace("<!-- TITLE -->", content.title || "Untitled")
            .replace("<!-- PATH -->", link);

          return tableRow;
        }),
      );
    } catch (error) {
      this.logger.warn("Error processing notes", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async generateIndividualNotePage(
    content: PageData,
    noteId: string,
    articleItemTemplate: string,
  ): Promise<void> {
    this.logger.debug("Generating individual note page", {
      noteId,
      title: content.title,
    });

    try {
      let updated = "";
      if (content.updated) {
        const updateTemplate =
          await this.templateProcessor.findComponent("update");
        updated = updateTemplate.replace("<!-- UPDATED -->", content.updated);
        this.logger.debug("Added update information to note", {
          noteId,
          updated: content.updated,
        });
      }

      const wrappedContent = articleItemTemplate
        .replace("<!-- DATE -->", content.date || "")
        .replace("<!-- UPDATE -->", updated)
        .replace("<!-- TITLE -->", content.title || "Untitled")
        .replace("<!-- CONTENT -->", content.content || "");

      const outputPath = this.config.getOutputPath(
        "notes",
        noteId,
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

      this.logger.info("Generated note page", {
        noteId,
        outputPath,
      });
    } catch (error) {
      this.logger.warn("Failed to generate individual note page", {
        noteId,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  private async generatePaginatedPages(notes: string[]): Promise<void> {
    const totalPages = Math.ceil(notes.length / this.ITEMS_PER_PAGE);
    this.logger.debug("Starting note pagination generation", {
      totalNotes: notes.length,
      totalPages,
      itemsPerPage: this.ITEMS_PER_PAGE,
    });

    try {
      // First, get the base template for the notes listing page
      const notesPagePath = path.join(
        this.config.getContentPath(""),
        "notes.html",
      );
      this.logger.debug("Loading notes page template", { path: notesPagePath });
      const notesPageContent =
        await this.templateProcessor.processContent(notesPagePath);

      // Get all the necessary components
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
        this.logger.debug("Generating note page", {
          currentPage,
          totalPages,
        });

        // Generate the paginated table content
        const paginatedTable = await this.generatePaginatedContent(
          notes,
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
            baseUrl: "/notes/",
          },
          this.ITEMS_PER_PAGE,
        );

        // Replace the table placeholder in the base page content
        const fullContent = notesPageContent.content.replace(
          "<!-- NOTES_TABLE -->",
          paginatedTable,
        );

        const outputPath =
          currentPage === 1
            ? this.config.getOutputPath("notes", "index.html")
            : this.config.getOutputPath(
                "notes",
                "page",
                currentPage.toString(),
                "index.html",
              );

        // Use the full content with the base template and title
        await this.templateProcessor.generatePage(
          {
            content: fullContent,
            template: notesPageContent.template, // This will be "base" from notes.html
            title: notesPageContent.title, // This will be "/notes/" from notes.html
          },
          outputPath,
        );

        this.logger.info("Generated note page", {
          pageNumber: currentPage,
          outputPath,
        });
      }
    } catch (error) {
      this.logger.warn("Failed to generate paginated note pages", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }
}
