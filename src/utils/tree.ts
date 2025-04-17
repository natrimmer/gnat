import { promises as fs } from "fs";
import path from "path";
import { getLogger } from "./logger";

interface TreeNode {
  name: string;
  path: string;
  children?: TreeNode[];
}

async function getDirectoryTree(
  dirPath: string,
  basePath: string,
): Promise<TreeNode[]> {
  const logger = getLogger();
  logger.debug("Starting directory scan", {
    directory: dirPath,
    isBaseDirectory: dirPath === basePath,
  });

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    logger.debug("Directory scan complete", {
      directory: dirPath,
      totalEntries: entries.length,
      directories: entries.filter((e) => e.isDirectory()).length,
      files: entries.filter((e) => e.isFile()).length,
    });

    let nodes: TreeNode[] = [];

    // Handle root directory special case
    if (dirPath === basePath) {
      const indexPath = path.join(dirPath, "index.html");
      try {
        await fs.access(indexPath);
        logger.debug("Found root index.html", { path: indexPath });
        nodes.push({
          name: "home",
          path: indexPath,
        });
      } catch (error) {
        logger.debug("No root index.html present");
      }
    }

    const excludedDirs = ["assets", "fonts"];
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Handle exclusions
      if (
        excludedDirs.includes(entry.name) ||
        (dirPath === basePath && entry.name === "index.html")
      ) {
        logger.debug("Skipping excluded path", {
          path: entry.name,
          reason: excludedDirs.includes(entry.name)
            ? "excluded directory"
            : "root index",
        });
        continue;
      }

      if (entry.isDirectory()) {
        logger.debug("Processing directory", {
          directory: entry.name,
          path: fullPath,
        });

        try {
          // Recursively process subdirectory
          const children = await getDirectoryTree(fullPath, basePath);

          // Check for HTML files
          const dirContents = await fs.readdir(fullPath);
          const hasHtml = dirContents.some((file) => file.endsWith(".html"));

          if (hasHtml) {
            logger.debug("Including directory in tree", {
              directory: entry.name,
              htmlFiles: dirContents.filter((f) => f.endsWith(".html")).length,
              childNodes: children.length,
            });

            nodes.push({
              name: entry.name,
              path: fullPath,
              children,
            });
          } else {
            logger.debug("Skipping directory (no HTML files)", {
              directory: entry.name,
              totalFiles: dirContents.length,
            });
          }
        } catch (error) {
          logger.warn("Error processing directory", {
            directory: entry.name,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    }

    logger.debug("Directory processing complete", {
      directory: dirPath,
      nodesGenerated: nodes.length,
    });
    return nodes;
  } catch (error) {
    logger.warn("Failed to process directory", {
      directory: dirPath,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

function renderTree(nodes: TreeNode[], prefix = "", parentPrefix = ""): string {
  const logger = getLogger();

  if (nodes.length === 0) {
    logger.debug("No nodes to render");
    return "";
  }

  logger.debug("Starting tree rendering", {
    nodeCount: nodes.length,
    hasPrefix: Boolean(prefix),
    hasParentPrefix: Boolean(parentPrefix),
  });

  let result = "";

  nodes.forEach((node, index) => {
    const isLastNode = index === nodes.length - 1;
    const connector = isLastNode ? "└── " : "├── ";
    const newLine = `${parentPrefix}${prefix}${connector}${node.name}\n`;
    result += newLine;

    logger.debug("Rendered tree node", {
      node: node.name,
      position: index + 1,
      isLast: isLastNode,
      hasChildren: Boolean(node.children?.length),
    });

    if (node.children && node.children.length > 0) {
      logger.debug("Processing child nodes", {
        parent: node.name,
        childCount: node.children.length,
      });

      const newPrefix = isLastNode ? "    " : "│   ";
      result += renderTree(
        node.children,
        "",
        parentPrefix + prefix + newPrefix,
      );
    }
  });

  logger.debug("Tree rendering complete", {
    totalLength: result.length,
    lineCount: result.split("\n").length - 1,
  });

  return result;
}

export async function generateTree(dirPath: string): Promise<string> {
  const logger = getLogger();
  const absolutePath = path.resolve(dirPath);

  logger.info("Starting tree generation", {
    directory: dirPath,
    absolutePath,
  });

  try {
    const tree = await getDirectoryTree(absolutePath, absolutePath);
    logger.info("Directory tree structure built", {
      topLevelItems: tree.length,
      totalNodes: countTotalNodes(tree),
    });

    const result = renderTree(tree);
    logger.info("Tree generation completed", {
      characters: result.length,
      lines: result.split("\n").length - 1,
    });

    return result;
  } catch (error) {
    logger.warn("Tree generation failed", {
      directory: dirPath,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

// Helper function to count total nodes in the tree
function countTotalNodes(nodes: TreeNode[]): number {
  return nodes.reduce((count, node) => {
    return count + 1 + (node.children ? countTotalNodes(node.children) : 0);
  }, 0);
}
