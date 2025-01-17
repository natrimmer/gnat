import fs from 'fs/promises';
import path from 'path';
import { BuildOptions } from 'src/utils/types';
import { getLogger } from '../utils/logger';
import { generateTree } from '../utils/tree';

interface PageData {
  content: string;
  template: string;
  [key: string]: string;
}

interface TrackingData {
  tracking: string;
  year: number;
  days: {
    [date: string]: ActivityData;
  };
}

type ActivityData = {
  [key: string]: number | string | ActivityData;
};

const COLOR_OPTIONS = ['mondrian_yellow', 'mondrian_red', 'mondrian_blue'];

function getColorOption(): string {
  return COLOR_OPTIONS[Math.floor(Math.random() * COLOR_OPTIONS.length)];
}

async function getAllTrackingData(): Promise<TrackingData[]> {
  try {
    const trackingPath = path.join(__dirname, '..', 'data', 'tracking');
    const yearDirs = (await fs.readdir(trackingPath, { withFileTypes: true }))
      .filter((dirent) => dirent.isDirectory() && !dirent.name.startsWith('.'))
      .map((dirent) => dirent.name);

    const allTrackingData = await Promise.all(
      yearDirs.map(async (year) => {
        const yearPath = path.join(trackingPath, year);
        const files = (await fs.readdir(yearPath, { withFileTypes: true }))
          .filter(
            (dirent) =>
              dirent.isFile() &&
              !dirent.name.startsWith('.') &&
              dirent.name.endsWith('.json'),
          )
          .map((dirent) => dirent.name);

        return Promise.all(
          files.map(async (filename) => {
            const filePath = path.join(yearPath, filename);
            const fileContent = await fs.readFile(filePath, 'utf-8');

            try {
              const data = JSON.parse(fileContent) as TrackingData;

              if (!data.tracking || !data.year || !data.days) {
                throw new Error(
                  `Invalid tracking data structure in ${year}/${filename}`,
                );
              }

              return data;
            } catch (parseError) {
              if (parseError instanceof Error) {
                throw new Error(
                  `Failed to parse ${year}/${filename}: ${parseError.message}`,
                );
              } else {
                throw new Error(
                  `Failed to parse ${year}/${filename}: ${String(parseError)}`,
                );
              }
            }
          }),
        );
      }),
    ).then((nestedArrays) => nestedArrays.flat());

    return allTrackingData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    if (error instanceof Error) {
      throw new Error(`Error reading tracking data: ${error.message}`);
    } else {
      throw new Error('Error reading tracking data');
    }
  }
}

async function parseMetadata(content: string): Promise<PageData> {
  const data: PageData = {
    content: content.trim(),
    template: '',
  };

  const metadataPattern = /<!--\s*(\w+):\s*([^>]*?)\s*-->/g;
  let match;

  const matches: { start: number; end: number }[] = [];

  while ((match = metadataPattern.exec(content)) !== null) {
    const [fullMatch, key, value] = match;

    const dataKey = key === 'extends' ? 'template' : key;
    data[dataKey] = value;

    matches.push({
      start: match.index,
      end: match.index + fullMatch.length,
    });
  }

  // Remove metadata tags from content in reverse order
  // to not affect other positions
  data.content = content;
  for (const position of matches.reverse()) {
    data.content =
      data.content.slice(0, position.start) + data.content.slice(position.end);
  }

  data.content = data.content.trim();
  return data;
}

async function findComponent(
  name: string,
  componentsDir: string,
): Promise<string> {
  const directPath = path.join(componentsDir, `${name}.html`);
  try {
    // inject last build date in footer
    if (name === 'footer') {
      const footerContent = await fs.readFile(directPath, 'utf-8');
      const lastBuildDate = new Date().toDateString();
      return footerContent.replace('<!-- LAST_UPDATED -->', lastBuildDate);
    }

    // inject version number from package.json
    if (name === 'version') {
      const versionContent = await fs.readFile(directPath, 'utf-8');
      const packageJson = await fs.readFile('./package.json', 'utf-8');
      const version = JSON.parse(packageJson).version;
      return versionContent.replace('<!-- VERSION_NUMBER -->', version);
    }

    return await fs.readFile(directPath, 'utf-8');
  } catch (error) {
    const entries = await fs.readdir(componentsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = path.join(componentsDir, entry.name, `${name}.html`);
        try {
          return await fs.readFile(subPath, 'utf-8');
        } catch {
          continue;
        }
      }
    }

    throw new Error(`Component not found: ${name}`);
  }
}

async function processIncludes(
  content: string,
  componentsDir: string,
): Promise<string> {
  const includeRegex = /<!--\s*INCLUDE:(\w+(?:-\w+)*)\s*-->/g;
  const processedIncludes = new Set<string>();

  async function processIncludesRecursive(content: string): Promise<string> {
    let result = content;
    const matches = Array.from(content.matchAll(includeRegex));

    for (const match of matches) {
      const componentName = match[1];

      if (processedIncludes.has(componentName)) {
        throw new Error(`Circular include detected: ${componentName}`);
      }

      processedIncludes.add(componentName);

      const componentContent = await findComponent(
        componentName,
        componentsDir,
      );
      // Recursively process includes in the component
      const processedComponent =
        await processIncludesRecursive(componentContent);

      result = result.replace(match[0], processedComponent);

      processedIncludes.delete(componentName);
    }

    return result;
  }

  return processIncludesRecursive(content);
}

async function buildPage(
  filePath: string,
  options: BuildOptions,
): Promise<void> {
  const logger = getLogger();

  if (!options.includeDrafts && path.basename(filePath).startsWith('draft_')) {
    logger.debug(`Skipping draft file: ${filePath}`);
    return;
  }

  const { srcDir = './src', outDir = './public' } = options;
  const componentsDir = path.join(srcDir, 'components');

  // Read the content file
  const content = await fs.readFile(filePath, 'utf-8');
  const pageData = await parseMetadata(content);

  if (pageData.template) {
    // Load and process the template
    const templateContent = await findComponent(
      pageData.template,
      componentsDir,
    );
    let finalContent = templateContent
      .replace('<!-- TITLE -->', pageData.title)
      .replace('<!-- CONTENT -->', pageData.content);

    // Process includes
    finalContent = await processIncludes(finalContent, componentsDir);

    // Create output path maintaining directory structure
    const relativePath = path.relative(path.join(srcDir, 'content'), filePath);

    switch (path.basename(filePath)) {
      case 'feed.html': {
        const feedTableRowTemplate = await findComponent(
          'feed-table-row',
          componentsDir,
        );
        const feedTableTemplate = await findComponent(
          'feed-table',
          componentsDir,
        );
        const feedItemTemplate = await findComponent(
          'feed-item',
          componentsDir,
        );

        const outputPath = path.join(outDir, 'feed', 'index.html');
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        // Get all feed content files
        const feedDir = path.join(srcDir, 'content', 'feed');
        const feedFiles = (await fs.readdir(feedDir))
          .filter((file) => {
            return (
              file.endsWith('.html') &&
              (options.includeDrafts || !file.startsWith('draft_'))
            );
          })
          .sort((a, b) => b.localeCompare(a)); // Sort in reverse order (newest first)

        // Process each feed item
        const feedItems = await Promise.all(
          feedFiles.map(async (file) => {
            const feedContent = await fs.readFile(
              path.join(feedDir, file),
              'utf-8',
            );

            const feedId = path.basename(file, '.html');
            const link = `/feed/${feedId}/`;

            const feedItemData = await parseMetadata(feedContent);
            const title = feedItemData.title || 'Untitled';
            const date = feedItemData.date || '';
            const content = feedItemData.content || '';

            const wrappedContent = feedItemTemplate
              .replace('<!-- DATE -->', date)
              .replace('<!-- TITLE -->', title)
              .replace('<!-- CONTENT -->', content);

            // Then load the base template and inject the wrapped content
            const baseTemplate = await findComponent('base', componentsDir);
            let individualPageContent = baseTemplate
              .replace('<!-- TITLE -->', title)
              .replace('<!-- CONTENT -->', wrappedContent);

            // Process includes for the base template
            individualPageContent = await processIncludes(
              individualPageContent,
              componentsDir,
            );

            // Always put feed items in /feed directory
            const individualPagePath = path.join(
              outDir,
              'feed',
              feedId,
              'index.html',
            );
            await fs.mkdir(path.dirname(individualPagePath), {
              recursive: true,
            });
            await fs.writeFile(individualPagePath, individualPageContent);

            // Return feed table row for the main feed page listing
            return feedTableRowTemplate
              .replace('<!-- DATE -->', date)
              .replace('<!-- CONTENT -->', content)
              .replace('<!-- PATH -->', link);
          }),
        );

        // Pagination setup
        const ITEMS_PER_PAGE = 20;
        const totalPages = Math.ceil(feedItems.length / ITEMS_PER_PAGE);

        const feedTableFooterTemplate = await findComponent(
          'feed-table-footer',
          componentsDir,
        );
        const feedTableNextLinkTemplate = await findComponent(
          'table-next-link',
          componentsDir,
        );
        const feedTablePrevLinkTemplate = await findComponent(
          'table-prev-link',
          componentsDir,
        );

        // Generate each page
        for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
          const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
          const endIndex = startIndex + ITEMS_PER_PAGE;
          const paginatedItems = feedItems.slice(startIndex, endIndex);

          // Create the feed table with the paginated items
          let feedTable = feedTableTemplate.replace(
            '<!-- FEED_ROWS -->',
            paginatedItems.join('\n'),
          );

          // Add footer with pagination
          let footer = feedTableFooterTemplate
            .replace('<!-- CURRENT_PAGE -->', currentPage.toString())
            .replace('<!-- TOTAL_PAGES -->', totalPages.toString());

          // Add navigation links
          const prevPagePath =
            currentPage > 1
              ? currentPage === 2
                ? '/feed/'
                : `/feed/page/${currentPage - 1}/`
              : '';
          const nextPagePath =
            currentPage < totalPages ? `/feed/page/${currentPage + 1}/` : '';

          if (prevPagePath) {
            footer = footer.replace(
              '<!-- FEED_TABLE_PREV_LINK -->',
              feedTablePrevLinkTemplate
                .replace('<!-- PATH -->', prevPagePath)
                .replace('<!-- COLOR -->', getColorOption()),
            );
          }

          if (nextPagePath) {
            footer = footer.replace(
              '<!-- FEED_TABLE_NEXT_LINK -->',
              feedTableNextLinkTemplate
                .replace('<!-- PATH -->', nextPagePath)
                .replace('<!-- COLOR -->', getColorOption()),
            );
          }

          feedTable = feedTable.replace('<!-- FEED_TABLE_FOOTER -->', footer);

          // Create the full page content
          let pageContent = finalContent.replace(
            '<!-- FEED_TABLE -->',
            feedTable,
          );

          // Determine output path for this page
          let pageOutputPath;
          if (currentPage === 1) {
            pageOutputPath = path.join(outDir, 'feed', 'index.html');
          } else {
            pageOutputPath = path.join(
              outDir,
              'feed',
              'page',
              currentPage.toString(),
              'index.html',
            );
          }

          // Ensure directory exists and write the file
          await fs.mkdir(path.dirname(pageOutputPath), { recursive: true });
          await fs.writeFile(pageOutputPath, pageContent);
        }
        break;
      }
      case 'notes.html': {
        const articleTableRowTemplate = await findComponent(
          'article-table-row',
          componentsDir,
        );
        const articleTableTemplate = await findComponent(
          'article-table',
          componentsDir,
        );
        const articleItemTemplate = await findComponent(
          'article-item',
          componentsDir,
        );

        const outputPath = path.join(outDir, 'notes', 'index.html');
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        // Get all article content files
        const notesDir = path.join(srcDir, 'content', 'notes');
        const notesFiles = (await fs.readdir(notesDir))
          .filter((file) => {
            return (
              file.endsWith('.html') &&
              (options.includeDrafts || !file.startsWith('draft_'))
            );
          })
          .sort((a, b) => b.localeCompare(a));

        // Process each feed item
        const notes = await Promise.all(
          notesFiles.map(async (note) => {
            const noteContent = await fs.readFile(
              path.join(notesDir, note),
              'utf-8',
            );

            const noteId = path.basename(note, '.html');
            const link = `/notes/${noteId}/`;

            const noteItemData = await parseMetadata(noteContent);
            const title = noteItemData.title || 'Untitled';
            const date = noteItemData.date || '';
            const content = noteItemData.content || '';
            let updated = noteItemData.updated || '';

            if (updated && updated !== '') {
              const updateTemplate = await findComponent(
                'update',
                componentsDir,
              );
              updated = updateTemplate.replace('<!-- UPDATED -->', updated);
            }

            const wrappedContent = articleItemTemplate
              .replace('<!-- DATE -->', date)
              .replace('<!-- UPDATE -->', updated)
              .replace('<!-- TITLE -->', title)
              .replace('<!-- CONTENT -->', content);

            // Then load the base template and inject the wrapped content
            const baseTemplate = await findComponent('base', componentsDir);
            let individualPageContent = baseTemplate
              .replace('<!-- TITLE -->', title)
              .replace('<!-- CONTENT -->', wrappedContent);

            // Process includes for the base template
            individualPageContent = await processIncludes(
              individualPageContent,
              componentsDir,
            );

            // Always put feed items in /feed directory
            const individualPagePath = path.join(
              outDir,
              'notes',
              noteId,
              'index.html',
            );
            await fs.mkdir(path.dirname(individualPagePath), {
              recursive: true,
            });
            await fs.writeFile(individualPagePath, individualPageContent);

            // Return note table row for the main note page listing
            return articleTableRowTemplate
              .replace('<!-- DATE -->', date)
              .replace('<!-- TITLE -->', title)
              .replace('<!-- PATH -->', link);
          }),
        );

        // Pagination setup
        const ITEMS_PER_PAGE = 20;
        const totalPages = Math.ceil(notes.length / ITEMS_PER_PAGE);

        const articleTableFooterTemplate = await findComponent(
          'article-table-footer',
          componentsDir,
        );
        const articleTableNextLinkTemplate = await findComponent(
          'table-next-link',
          componentsDir,
        );
        const articleTablePrevLinkTemplate = await findComponent(
          'table-prev-link',
          componentsDir,
        );

        // Generate each page
        for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
          const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
          const endIndex = startIndex + ITEMS_PER_PAGE;
          const paginatedItems = notes.slice(startIndex, endIndex);

          let noteTable = articleTableTemplate.replace(
            '<!-- ARTICLE_ROWS -->',
            paginatedItems.join('\n'),
          );

          // Add footer with pagination
          let footer = articleTableFooterTemplate
            .replace('<!-- CURRENT_PAGE -->', currentPage.toString())
            .replace('<!-- TOTAL_PAGES -->', totalPages.toString());

          // Add navigation links
          const prevPagePath =
            currentPage > 1
              ? currentPage === 2
                ? '/notes/'
                : `/notes/page/${currentPage - 1}/`
              : '';
          const nextPagePath =
            currentPage < totalPages ? `/notes/page/${currentPage + 1}/` : '';

          if (prevPagePath) {
            footer = footer.replace(
              '<!-- ARTICLE_TABLE_PREV_LINK -->',
              articleTablePrevLinkTemplate
                .replace('<!-- PATH -->', prevPagePath)
                .replace('<!-- COLOR -->', getColorOption()),
            );
          }

          if (nextPagePath) {
            footer = footer.replace(
              '<!-- ARTICLE_TABLE_NEXT_LINK -->',
              articleTableNextLinkTemplate
                .replace('<!-- PATH -->', nextPagePath)
                .replace('<!-- COLOR -->', getColorOption()),
            );
          }

          noteTable = noteTable.replace(
            '<!-- ARTICLE_TABLE_FOOTER -->',
            footer,
          );

          // Create the full page content
          let pageContent = finalContent.replace(
            '<!-- NOTES_TABLE -->',
            noteTable,
          );

          // Determine output path for this page
          let pageOutputPath;
          if (currentPage === 1) {
            pageOutputPath = path.join(outDir, 'notes', 'index.html');
          } else {
            pageOutputPath = path.join(
              outDir,
              'notes',
              'page',
              currentPage.toString(),
              'index.html',
            );
          }

          // Ensure directory exists and write the file
          await fs.mkdir(path.dirname(pageOutputPath), { recursive: true });
          await fs.writeFile(pageOutputPath, pageContent);
        }
        break;
      }
      case 'articles.html': {
        const articleTableRowTemplate = await findComponent(
          'article-table-row',
          componentsDir,
        );
        const articleTableTemplate = await findComponent(
          'article-table',
          componentsDir,
        );
        const articleItemTemplate = await findComponent(
          'article-item',
          componentsDir,
        );

        const outputPath = path.join(outDir, 'articles', 'index.html');
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        // Get all article content files
        const articleDir = path.join(srcDir, 'content', 'articles');
        const articleFiles = (await fs.readdir(articleDir))
          .filter((file) => {
            return (
              file.endsWith('.html') &&
              (options.includeDrafts || !file.startsWith('draft_'))
            );
          })
          .sort((a, b) => b.localeCompare(a)); // Sort in reverse order (newest first)

        // Process each article item
        const articles = await Promise.all(
          articleFiles.map(async (article) => {
            const articleContent = await fs.readFile(
              path.join(articleDir, article),
              'utf-8',
            );

            const articleId = path.basename(article, '.html');
            const link = `/articles/${articleId}/`;

            const articleItemData = await parseMetadata(articleContent);
            const title = articleItemData.title || 'Untitled';
            const date = articleItemData.date || '';
            const content = articleItemData.content || '';
            let updated = articleItemData.updated || '';

            if (updated && updated !== '') {
              const updateTemplate = await findComponent(
                'update',
                componentsDir,
              );
              updated = updateTemplate.replace('<!-- UPDATED -->', updated);
            }

            const wrappedContent = articleItemTemplate
              .replace('<!-- DATE -->', date)
              .replace('<!-- UPDATE -->', updated)
              .replace('<!-- TITLE -->', title)
              .replace('<!-- CONTENT -->', content);

            // Then load the base template and inject the wrapped content
            const baseTemplate = await findComponent('base', componentsDir);
            let individualPageContent = baseTemplate
              .replace('<!-- TITLE -->', title)
              .replace('<!-- CONTENT -->', wrappedContent);

            // Process includes for the base template
            individualPageContent = await processIncludes(
              individualPageContent,
              componentsDir,
            );

            // Always put feed items in /feed directory
            const individualPagePath = path.join(
              outDir,
              'articles',
              articleId,
              'index.html',
            );
            await fs.mkdir(path.dirname(individualPagePath), {
              recursive: true,
            });
            await fs.writeFile(individualPagePath, individualPageContent);

            // Return feed table row for the main feed page listing
            return articleTableRowTemplate
              .replace('<!-- DATE -->', date)
              .replace('<!-- TITLE -->', title)
              .replace('<!-- PATH -->', link);
          }),
        );

        // Pagination setup
        const ITEMS_PER_PAGE = 20;
        const totalPages = Math.ceil(articles.length / ITEMS_PER_PAGE);

        const articleTableFooterTemplate = await findComponent(
          'article-table-footer',
          componentsDir,
        );
        const articleTableNextLinkTemplate = await findComponent(
          'table-next-link',
          componentsDir,
        );
        const articleTablePrevLinkTemplate = await findComponent(
          'table-prev-link',
          componentsDir,
        );

        // Generate each page
        for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
          const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
          const endIndex = startIndex + ITEMS_PER_PAGE;
          const paginatedItems = articles.slice(startIndex, endIndex);

          let articleTable = articleTableTemplate.replace(
            '<!-- ARTICLE_ROWS -->',
            paginatedItems.join('\n'),
          );

          // Add footer with pagination
          let footer = articleTableFooterTemplate
            .replace('<!-- CURRENT_PAGE -->', currentPage.toString())
            .replace('<!-- TOTAL_PAGES -->', totalPages.toString());

          // Add navigation links
          const prevPagePath =
            currentPage > 1
              ? currentPage === 2
                ? '/articles/'
                : `/articles/page/${currentPage - 1}/`
              : '';
          const nextPagePath =
            currentPage < totalPages
              ? `/articles/page/${currentPage + 1}/`
              : '';

          if (prevPagePath) {
            footer = footer.replace(
              '<!-- ARTICLE_TABLE_PREV_LINK -->',
              articleTablePrevLinkTemplate
                .replace('<!-- PATH -->', prevPagePath)
                .replace('<!-- COLOR -->', getColorOption()),
            );
          }

          if (nextPagePath) {
            footer = footer.replace(
              '<!-- ARTICLE_TABLE_NEXT_LINK -->',
              articleTableNextLinkTemplate
                .replace('<!-- PATH -->', nextPagePath)
                .replace('<!-- COLOR -->', getColorOption()),
            );
          }

          articleTable = articleTable.replace(
            '<!-- ARTICLE_TABLE_FOOTER -->',
            footer,
          );

          // Create the full page content
          let pageContent = finalContent.replace(
            '<!-- ARTICLE_TABLE -->',
            articleTable,
          );

          // Determine output path for this page
          let pageOutputPath;
          if (currentPage === 1) {
            pageOutputPath = path.join(outDir, 'articles', 'index.html');
          } else {
            pageOutputPath = path.join(
              outDir,
              'articles',
              'page',
              currentPage.toString(),
              'index.html',
            );
          }

          // Ensure directory exists and write the file
          await fs.mkdir(path.dirname(pageOutputPath), { recursive: true });
          await fs.writeFile(pageOutputPath, pageContent);
        }
        break;
      }
      case 'tracking.html': {
        let outputPath;
        if (path.basename(relativePath) === 'index.html') {
          outputPath = path.join(outDir, relativePath);
        } else {
          const dirname = path.basename(relativePath, '.html');
          if (
            relativePath.includes(path.join('feed', '')) ||
            relativePath.includes(path.join('articles', '')) ||
            relativePath.includes(path.join('notes', ''))
          ) {
            return;
          }
          outputPath = path.join(outDir, dirname, 'index.html');
        }
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        await fs.writeFile(outputPath, finalContent);
        break;
      }
      case 'changelog.html': {
        const changelogTableRowTemplate = await findComponent(
          'changelog-table-row',
          componentsDir,
        );
        const changelogTableTemplate = await findComponent(
          'changelog-table',
          componentsDir,
        );

        const outputPath = path.join(outDir, 'changelog', 'index.html');
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        // Get all changelog content files
        const changelogDir = path.join(srcDir, 'content', 'changelog');
        const changelogFiles = (await fs.readdir(changelogDir))
          .filter((file) => {
            return (
              file.endsWith('.html') &&
              (options.includeDrafts || !file.startsWith('draft_'))
            );
          })
          .sort((a, b) => b.localeCompare(a)); // Sort in reverse order (newest first)

        // Process each changelog entry
        const entries = await Promise.all(
          changelogFiles.map(async (file) => {
            const changelogContent = await fs.readFile(
              path.join(changelogDir, file),
              'utf-8',
            );

            const changelogItemData = await parseMetadata(changelogContent);
            const version = changelogItemData.version || '';
            const date = changelogItemData.date || '';
            const content = changelogItemData.content || '';
            let link = changelogItemData.link || '';

            let rowContent = changelogTableRowTemplate;

            // First replace version, date, and changes
            rowContent = rowContent
              .replace('<!-- VERSION -->', version)
              .replace('<!-- DATE -->', date)
              .replace('<!-- CHANGES -->', content);

            // Then handle the link if it exists
            if (link && link !== '') {
              const changelogTableLinkTemplate = await findComponent(
                'changelog-table-link',
                componentsDir,
              );
              const linkHtml = changelogTableLinkTemplate
                .replace('<!-- LINK -->', link)
                .replace('<!-- VERSION -->', version)
                .replace('<!-- COLOR -->', getColorOption());
              rowContent = rowContent.replace('<!-- LINK -->', linkHtml);
            }

            return rowContent;
          }),
        );

        // Pagination setup
        const ITEMS_PER_PAGE = 20;
        const totalPages = Math.ceil(entries.length / ITEMS_PER_PAGE);

        const changelogTableFooterTemplate = await findComponent(
          'changelog-table-footer',
          componentsDir,
        );
        const changelogTableNextLinkTemplate = await findComponent(
          'table-next-link',
          componentsDir,
        );
        const changelogTablePrevLinkTemplate = await findComponent(
          'table-prev-link',
          componentsDir,
        );

        // Generate each page
        for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
          const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
          const endIndex = startIndex + ITEMS_PER_PAGE;
          const paginatedItems = entries.slice(startIndex, endIndex);

          let changelogTable = changelogTableTemplate.replace(
            '<!-- ROWS -->',
            paginatedItems.join('\n'),
          );

          // Add footer with pagination
          let footer = changelogTableFooterTemplate
            .replace('<!-- CURRENT_PAGE -->', currentPage.toString())
            .replace('<!-- TOTAL_PAGES -->', totalPages.toString());

          // Add navigation links
          const prevPagePath =
            currentPage > 1
              ? currentPage === 2
                ? '/changelog/'
                : `/changelog/page/${currentPage - 1}/`
              : '';
          const nextPagePath =
            currentPage < totalPages
              ? `/changelog/page/${currentPage + 1}/`
              : '';

          if (prevPagePath) {
            footer = footer.replace(
              '<!-- PREV_LINK -->',
              changelogTablePrevLinkTemplate
                .replace('<!-- PATH -->', prevPagePath)
                .replace('<!-- COLOR -->', getColorOption()),
            );
          }

          if (nextPagePath) {
            footer = footer.replace(
              '<!-- NEXT_LINK -->',
              changelogTableNextLinkTemplate
                .replace('<!-- PATH -->', nextPagePath)
                .replace('<!-- COLOR -->', getColorOption()),
            );
          }

          changelogTable = changelogTable.replace('<!-- FOOTER -->', footer);

          // Create the full page content
          let pageContent = finalContent.replace(
            '<!-- CHANGELOG_TABLE -->',
            changelogTable,
          );

          // Process includes
          pageContent = await processIncludes(pageContent, componentsDir);

          // Determine output path for this page
          let pageOutputPath;
          if (currentPage === 1) {
            pageOutputPath = path.join(outDir, 'changelog', 'index.html');
          } else {
            pageOutputPath = path.join(
              outDir,
              'changelog',
              'page',
              currentPage.toString(),
              'index.html',
            );
          }

          // Ensure directory exists and write the file
          await fs.mkdir(path.dirname(pageOutputPath), { recursive: true });
          await fs.writeFile(pageOutputPath, pageContent);
        }
        break;
      }
      case 'sitemap.html': {
        logger.info('Processing sitemap');

        const outputPath = path.join(outDir, 'sitemap', 'index.html');
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        // First, generate the sitemap without the tree
        await fs.writeFile(outputPath, finalContent);

        // Then generate the tree and update the sitemap
        try {
          const treeOutput = await generateTree(outDir);
          console.log('treeOutput: ', treeOutput);

          finalContent = finalContent.replace(
            '<!-- COMMAND_OUTPUT -->',
            treeOutput.trim(),
          );

          // Write the updated content with the tree output
          await fs.writeFile(outputPath, finalContent);
        } catch (error) {
          logger.error('Failed to generate sitemap tree:', error);
        }
        break;
      }
      default: {
        let outputPath;
        if (path.basename(relativePath) === 'index.html') {
          outputPath = path.join(outDir, relativePath);
        } else {
          const dirname = path.basename(relativePath, '.html');
          if (
            relativePath.includes(path.join('feed', '')) ||
            relativePath.includes(path.join('articles', '')) ||
            relativePath.includes(path.join('notes', ''))
          ) {
            return;
          }
          outputPath = path.join(outDir, dirname, 'index.html');
        }
        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        await fs.writeFile(outputPath, finalContent);
        break;
      }
    }
    logger.debug(`Built page: ${filePath}`);
  }
}

async function getAllContentFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  async function scan(directory: string) {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.name.endsWith('.html')) {
        files.push(fullPath);
      }
    }
  }

  await scan(dir);
  return files;
}

export async function build(options: BuildOptions = {}): Promise<void> {
  const logger = getLogger();
  const {
    srcDir = './src',
    outDir = './public',
    clean = true,
    includeDrafts,
  } = options;

  try {
    if (clean) {
      await cleanDirectory(outDir);
    }

    await fs.mkdir(outDir, { recursive: true });
    logger.info('Initiating build process');

    if (includeDrafts) {
      logger.warn('Including draft files in the build');
    } else {
      logger.info('Excluding draft files from the build');
    }

    const trackingData = await getAllTrackingData();
    console.log('td: ', trackingData);
    logger.debug('Loaded tracking data:', trackingData);

    const contentDir = path.join(srcDir, 'content');
    const files = await getAllContentFiles(contentDir);

    // First, build all pages
    await Promise.all(
      files
        .filter((file) => !file.endsWith('sitemap.html'))
        .map((file) => buildPage(file, options)),
    );

    // Then, build the sitemap
    const sitemapFile = files.find((file) => file.endsWith('sitemap.html'));
    if (sitemapFile) {
      await buildPage(sitemapFile, options);
    }

    logger.info('Build completed successfully');
  } catch (error) {
    logger.error('Build failed:', error);
    throw error;
  }
}

async function cleanDirectory(directory: string): Promise<void> {
  const logger = getLogger();
  try {
    const files = await fs.readdir(directory, { withFileTypes: true });

    for (const file of files) {
      const fullPath = path.join(directory, file.name);

      if (file.isDirectory()) {
        // Recursively clean the sub-directory
        await cleanDirectory(fullPath);

        // After cleaning, check if the directory is empty
        const remainingFiles = await fs.readdir(fullPath);
        if (remainingFiles.length === 0) {
          await fs.rmdir(fullPath);
          logger.debug(`Removed empty directory: ${fullPath}`);
        }
      } else if (file.name.endsWith('.html')) {
        await fs.unlink(fullPath);
        logger.debug(`Removed HTML file: ${fullPath}`);
      }
    }
  } catch (error) {
    logger.warn(`Error while cleaning files from ${directory}:`, error);
  }
}
