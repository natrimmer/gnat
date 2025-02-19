import { SiteConfig } from "../config/SiteConfig";
import { ArticlesHandler } from "../handlers/ArticlesHandler";
import { ChangelogHandler } from "../handlers/ChangelogHandler";
import { FeedHandler } from "../handlers/FeedHandler";
import { NotesHandler } from "../handlers/NotesHandler";
import { PageHandler } from "../handlers/PageHandler";
import { getLogger } from "../utils/logger";
import { ContentHandler } from "./ContentHandler";

export class ContentHandlerFactory {
  private static handlers: Map<string, ContentHandler> = new Map();
  private static readonly logger = getLogger();

  static getHandler(type: string): ContentHandler {
    this.logger.debug("Requesting content handler", { type });

    if (this.handlers.has(type)) {
      this.logger.debug("Cache hit: returning existing handler", { type });
      return this.handlers.get(type)!;
    }

    this.logger.info(`Creating new content handler for type: ${type}`);

    try {
      const config = SiteConfig.getInstance();
      this.logger.debug("Retrieved site configuration");

      let handler: ContentHandler;

      switch (type) {
        case "articles":
          this.logger.debug("Initializing ArticlesHandler");
          handler = new ArticlesHandler(config);
          break;
        case "feed":
          this.logger.debug("Initializing FeedHandler");
          handler = new FeedHandler(config);
          break;
        case "notes":
          this.logger.debug("Initializing NotesHandler");
          handler = new NotesHandler(config);
          break;
        case "changelog":
          this.logger.debug("Initializing ChangelogHandler");
          handler = new ChangelogHandler(config);
          break;
        case "pages":
          this.logger.debug("Initializing PageHandler");
          handler = new PageHandler(config);
          break;
        default:
          this.logger.warn("Unknown content type requested", { type });
          throw new Error(`Unknown content type: ${type}`);
      }

      this.handlers.set(type, handler);
      this.logger.info("Successfully created and cached new handler", {
        type,
        handlerType: handler.constructor.name,
      });

      return handler;
    } catch (error) {
      this.logger.warn("Failed to create content handler", {
        type,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  static clearHandlers(): void {
    this.logger.info(
      `Clearing handler cache. Current cache size: ${this.handlers.size}`,
    );
    this.handlers.clear();
    this.logger.debug("Handler cache cleared");
  }
}
