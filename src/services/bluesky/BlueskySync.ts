import { AtpAgent } from "@atproto/api";
import fs from "fs";
import path from "path";
import { initLogger } from "src/utils/logger";
import { ServiceTimestamps } from "src/utils/types";
import { Post, PostEmbed } from "./types";

const POSTS_DIR = "src/content/feed";
const TEMPLATE_PATH = "src/components/feed-template.html";
const TIMESTAMPS_FILE = "src/data/service_timestamps.json";

function getLastCheckedTime(): string {
  const logger = initLogger();
  logger.debug("Getting last checked time");

  try {
    const timestamps = JSON.parse(
      fs.readFileSync(TIMESTAMPS_FILE, "utf-8"),
    ) as ServiceTimestamps;

    const lastSync = timestamps.bluesky_last_sync || new Date(0).toISOString();
    logger.debug("Retrieved last sync time", { lastSync });
    return lastSync;
  } catch (error) {
    logger.warn("Failed to read timestamps file, using default time", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return new Date(0).toISOString();
  }
}

function saveLastCheckedTime(time: string): void {
  const logger = initLogger();
  logger.debug("Saving last checked time", { time });

  try {
    let timestamps: ServiceTimestamps;
    try {
      timestamps = JSON.parse(fs.readFileSync(TIMESTAMPS_FILE, "utf-8"));
      logger.debug("Read existing timestamps file");
    } catch {
      logger.debug("No existing timestamps file, creating new one");
      timestamps = {
        bluesky_last_sync: "",
        hevy_last_sync: "",
        prod_last_build: "",
      };
    }

    timestamps.bluesky_last_sync = time;
    fs.writeFileSync(TIMESTAMPS_FILE, JSON.stringify(timestamps, null, 2));
    logger.info("Saved new timestamp", { time });
  } catch (error) {
    logger.warn("Failed to save timestamp", {
      time,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

async function getNewPosts(
  agent: AtpAgent,
  did: string,
  lastChecked: string,
  logger: ReturnType<typeof initLogger>,
): Promise<Post[]> {
  const newPosts: Post[] = [];
  let cursor: string | undefined;

  logger.debug("Starting to fetch new posts", {
    did,
    lastChecked,
  });

  do {
    try {
      logger.debug("Fetching feed page", { cursor });
      const response = await agent.getAuthorFeed({
        actor: did,
        limit: 50,
        cursor,
        filter: "posts_no_replies",
      });

      for (const item of response.data.feed) {
        const postDate = new Date(item.post.indexedAt);

        if (lastChecked === "") {
          newPosts.push(item.post as Post);
          logger.info("Found new post (initial sync)", {
            uri: item.post.uri,
            date: postDate.toISOString(),
          });
        } else if (postDate > new Date(lastChecked)) {
          newPosts.push(item.post as Post);
          logger.info("Found new post", {
            uri: item.post.uri,
            date: postDate.toISOString(),
          });
        } else {
          logger.info("No more new posts found", {
            lastPostDate: postDate.toISOString(),
          });
          return newPosts;
        }
      }

      cursor = response.data.cursor;
    } catch (error) {
      logger.warn("Error fetching feed page", {
        cursor,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  } while (cursor);

  logger.info("Completed post fetch", {
    totalNewPosts: newPosts.length,
  });
  return newPosts;
}

async function main() {
  const agent = new AtpAgent({
    service: "https://bsky.social",
  });
  const logger = initLogger();
  logger.info("Starting Bluesky sync");

  try {
    logger.debug("Attempting login to Bluesky");
    await agent.login({
      identifier: process.env.BLUESKY_IDENTIFIER!,
      password: process.env.BLUESKY_PASSWORD!,
    });
    logger.info("Successfully logged in to Bluesky");

    const lastChecked = getLastCheckedTime();
    if (!lastChecked) {
      logger.info("No last sync time found, performing initial sync");
    } else {
      logger.info("Starting incremental sync", { lastChecked });
    }

    logger.debug("Fetching profile information");
    const profile = await agent.getProfile({
      actor: process.env.BLUESKY_IDENTIFIER!,
    });
    logger.info("Retrieved profile information", {
      handle: profile.data.handle,
    });

    const posts = await getNewPosts(
      agent,
      profile.data.did,
      lastChecked,
      logger,
    );

    logger.info("Processing posts", { count: posts.length });
    for (const post of [...posts].reverse()) {
      await createPost(post, logger);
    }

    const newTimestamp = new Date().toISOString();
    saveLastCheckedTime(newTimestamp);
    logger.info("Sync completed successfully", {
      processedPosts: posts.length,
      newTimestamp,
    });
  } catch (error) {
    logger.warn("Sync failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

function processEmbed(embed: PostEmbed | undefined): string {
  const logger = initLogger();

  if (!embed) {
    logger.debug("No embed to process");
    return "";
  }

  logger.debug("Processing embed", { type: embed.$type });

  try {
    switch (embed.$type) {
      case "app.bsky.embed.images#view":
        logger.debug("Processing image embed", {
          imageCount: embed.images.length,
        });
        return embed.images
          .map(
            (img) =>
              `<img src="${escapeHtml(img.fullsize)}" alt="${escapeHtml(img.alt)}" />`,
          )
          .join("\n");

      case "app.bsky.embed.external#view":
        logger.debug("Processing external link embed", {
          uri: embed.external.uri,
        });
        return `<a href="${escapeHtml(embed.external.uri)}" target="_blank">
          ${escapeHtml(embed.external.title)}
        </a>`;

      case "app.bsky.embed.record#view":
        logger.debug("Processing quoted post embed");
        return `<blockquote>Quoted post: ${escapeHtml(embed.record.text)}</blockquote>`;

      default:
        logger.warn("Unknown embed type", { embed: embed });
        return "";
    }
  } catch (error) {
    logger.warn("Error processing embed", {
      type: embed.$type,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return "";
  }
}

async function createPost(
  post: Post,
  logger: ReturnType<typeof initLogger>,
): Promise<void> {
  logger.debug("Creating post file", { uri: post.uri });

  try {
    const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
    const postNumber = getNextPostNumber();
    const fileName = `${postNumber.toString().padStart(4, "0")}.html`;

    logger.debug("Generated file name", {
      postNumber,
      fileName,
    });

    const content = [
      `<p>${escapeHtml(post.record.text || "")}</p>`,
      processEmbed(post.embed),
    ]
      .filter(Boolean)
      .join("\n");

    const rendered = template
      .replace("{title}", `/feed/${fileName.replace(".html", "")}/`)
      .replace("{date}", new Date(post.indexedAt).toISOString().split("T")[0])
      .replace(
        "{link}",
        `https://bsky.app/profile/${process.env.BLUESKY_IDENTIFIER}/post/${post.uri.split("/").pop()}`,
      )
      .replace("{content}", content);

    fs.writeFileSync(path.join(POSTS_DIR, fileName), rendered);
    logger.info("Post file created successfully", {
      fileName,
      path: path.join(POSTS_DIR, fileName),
    });
  } catch (error) {
    logger.warn("Failed to create post file", {
      uri: post.uri,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

function getNextPostNumber(): number {
  const logger = initLogger();
  logger.debug("Getting next post number");

  try {
    const files = fs.readdirSync(POSTS_DIR);
    const numbers = files
      .filter((f) => f.endsWith(".html") && !f.startsWith("draft_"))
      .map((f) => parseInt(f.slice(0, 4), 10));

    const nextNumber = numbers.length ? Math.max(...numbers) + 1 : 1;
    logger.debug("Retrieved next post number", {
      existingFiles: numbers.length,
      nextNumber,
    });
    return nextNumber;
  } catch (error) {
    logger.warn("Error getting next post number", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
  }
}

function escapeHtml(text: string): string {
  const logger = initLogger();
  logger.debug("Escaping HTML content", {
    length: text.length,
  });

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

main().catch((error) => {
  const logger = initLogger();
  logger.warn("Fatal error in main process", {
    error: error instanceof Error ? error.message : "Unknown error",
  });
});
