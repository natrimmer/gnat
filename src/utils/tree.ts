import { promises as fs } from 'fs';
import path from 'path';
import { getLogger } from './logger';

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
  logger.debug(`Scanning directory: ${dirPath}`);

  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  logger.debug(`Found ${entries.length} entries in ${dirPath}`);

  let nodes: TreeNode[] = [];

  if (dirPath === basePath) {
    const indexPath = path.join(dirPath, 'index.html');
    try {
      await fs.access(indexPath);
      logger.debug('Found home page: index.html');
      nodes.push({
        name: 'home',
        path: indexPath,
      });
    } catch (error) {
      logger.debug('No root index.html found');
    }
  }

  for (const entry of entries) {
    if (
      entry.name === 'assets' ||
      entry.name === 'fonts' ||
      (dirPath === basePath && entry.name === 'index.html')
    ) {
      logger.debug(`Skipping excluded path: ${entry.name}`);
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      logger.debug(`Found directory: ${entry.name}`);
      const children = await getDirectoryTree(fullPath, basePath);

      try {
        const hasHtml = (await fs.readdir(fullPath)).some((file) =>
          file.endsWith('.html'),
        );

        if (hasHtml) {
          logger.debug(
            `Including directory ${entry.name} (contains HTML files)`,
          );
          nodes.push({
            name: entry.name,
            path: fullPath,
            children,
          });
        } else {
          logger.debug(`Skipping directory ${entry.name} (no HTML files)`);
        }
      } catch (error) {
        logger.debug(`Error checking directory ${entry.name}: ${error}`);
      }
    }
  }

  return nodes;
}

function renderTree(nodes: TreeNode[], prefix = '', parentPrefix = ''): string {
  const logger = getLogger();

  if (nodes.length === 0) {
    logger.debug('No nodes to render');
    return '';
  }

  logger.debug(`Rendering ${nodes.length} nodes`);
  let result = '';

  nodes.forEach((node, index) => {
    const isLastNode = index === nodes.length - 1;
    const connector = isLastNode ? '└── ' : '├── ';
    const newLine = `${parentPrefix}${prefix}${connector}${node.name}\n`;
    result += newLine;

    logger.debug(`Added node to tree: ${node.name}`);

    if (node.children && node.children.length > 0) {
      logger.debug(
        `Processing ${node.children.length} children for ${node.name}`,
      );
      const newPrefix = isLastNode ? '    ' : '│   ';
      result += renderTree(
        node.children,
        '',
        parentPrefix + prefix + newPrefix,
      );
    }
  });

  return result;
}

export async function generateTree(dirPath: string): Promise<string> {
  const logger = getLogger();
  const absolutePath = path.resolve(dirPath);
  logger.info(`Generating tree for directory: ${absolutePath}`);

  const tree = await getDirectoryTree(absolutePath, absolutePath);
  logger.info(`Found ${tree.length} top-level items`);

  const result = renderTree(tree);
  logger.info('Tree generation completed');

  return result;
}
