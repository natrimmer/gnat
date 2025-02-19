import fs from "fs/promises";
import path from "path";
import { getLogger } from "./logger";

export async function cleanDirectory(directory: string): Promise<void> {
  const logger = getLogger();
  logger.info("Starting directory cleanup", { directory });

  try {
    logger.debug("Reading directory contents", { directory });
    const files = await fs.readdir(directory, { withFileTypes: true });
    logger.debug("Found items to process", {
      directory,
      totalItems: files.length,
      directories: files.filter((f) => f.isDirectory()).length,
      htmlFiles: files.filter((f) => f.isFile() && f.name.endsWith(".html"))
        .length,
    });

    for (const file of files) {
      const fullPath = path.join(directory, file.name);

      if (file.isDirectory()) {
        logger.debug("Processing subdirectory", {
          directory: fullPath,
          parentDirectory: directory,
        });

        try {
          // Recursively clean subdirectory
          await cleanDirectory(fullPath);

          // Check if directory is empty after cleaning
          const remainingFiles = await fs.readdir(fullPath);

          if (remainingFiles.length === 0) {
            logger.debug("Removing empty directory", { directory: fullPath });
            await fs.rmdir(fullPath);
            logger.info("Successfully removed empty directory", {
              directory: fullPath,
              parentDirectory: directory,
            });
          } else {
            logger.debug("Directory not empty, keeping directory", {
              directory: fullPath,
              remainingItems: remainingFiles.length,
            });
          }
        } catch (error) {
          logger.warn("Error processing subdirectory", {
            directory: fullPath,
            parentDirectory: directory,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          // Continue processing other files even if one fails
          continue;
        }
      } else if (file.name.endsWith(".html")) {
        try {
          logger.debug("Removing HTML file", {
            file: fullPath,
            directory,
          });

          await fs.unlink(fullPath);

          logger.info("Successfully removed HTML file", {
            file: fullPath,
            directory,
          });
        } catch (error) {
          logger.warn("Error removing HTML file", {
            file: fullPath,
            directory,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          // Continue processing other files even if one fails
          continue;
        }
      } else {
        logger.debug("Skipping non-HTML file", {
          file: fullPath,
          extension: path.extname(file.name),
        });
      }
    }

    logger.info("Completed directory cleanup", { directory });
  } catch (error) {
    logger.warn("Failed to clean directory", {
      directory,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error; // Re-throw to allow caller to handle the error
  }
}
