import { AppBskyFeedDefs, AtpAgent } from "@atproto/api";
import fs from "fs";
import path from "path";
import { initLogger } from "../utils/logger";
import { ServiceTimestamps } from "../utils/types";

const POSTS_DIR = "src/content/feed";
const TEMPLATE_PATH = "src/components/feed-template.html";

interface ImageEmbed {
  $type: "app.bsky.embed.images#view";
  images: {
    fullsize: string;
    alt: string;
  }[];
  [key: string]: unknown;
}

interface ExternalEmbed {
  $type: "app.bsky.embed.external#view";
  external: {
    uri: string;
    title: string;
  };
  [key: string]: unknown;
}

interface RecordEmbed {
  $type: "app.bsky.embed.record#view";
  record: {
    text: string;
  };
  [key: string]: unknown;
}

type PostEmbed = ImageEmbed | ExternalEmbed | RecordEmbed;

interface Post extends AppBskyFeedDefs.PostView {
  embed?: PostEmbed;
  record: {
    text?: string;
  };
}

const TIMESTAMPS_FILE = "service_timestamps.json";

function getLastCheckedTime(): string {
  try {
    const timestamps = JSON.parse(
      fs.readFileSync(TIMESTAMPS_FILE, "utf-8"),
    ) as ServiceTimestamps;
    return timestamps.bluesky_last_sync || new Date(0).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

function saveLastCheckedTime(time: string): void {
  try {
    let timestamps: ServiceTimestamps;
    try {
      timestamps = JSON.parse(fs.readFileSync(TIMESTAMPS_FILE, "utf-8"));
    } catch {
      timestamps = {
        bluesky_last_sync: "",
        hevy_last_sync: "",
        prod_last_build: "",
      };
    }

    timestamps.bluesky_last_sync = time;
    fs.writeFileSync(TIMESTAMPS_FILE, JSON.stringify(timestamps, null, 2));
  } catch (error) {
    console.error("Failed to save timestamp:", error);
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

  do {
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
        logger.info(`New post found: ${item.post.uri}`);
      } else if (postDate > new Date(lastChecked)) {
        newPosts.push(item.post as Post);
        logger.info(`New post found: ${item.post.uri}`);
      } else {
        logger.info("No more new posts found.");
        return newPosts;
      }
    }

    cursor = response.data.cursor;
  } while (cursor);

  return newPosts;
}

async function main() {
  const agent = new AtpAgent({
    service: "https://bsky.social",
  });
  const logger = initLogger();

  try {
    await agent.login({
      identifier: process.env.BLUESKY_IDENTIFIER!,
      password: process.env.BLUESKY_PASSWORD!,
    });
    logger.info("Logged in to Bluesky");

    const lastChecked = getLastCheckedTime();
    if (!lastChecked) {
      logger.info("No last sync time found, fetching all posts.");
    } else {
      logger.info(`Last sync time: ${lastChecked}`);
    }

    const profile = await agent.getProfile({
      actor: process.env.BLUESKY_IDENTIFIER!,
    });
    logger.info(`Fetching posts for ${profile.data.handle}`);

    const posts = await getNewPosts(
      agent,
      profile.data.did,
      lastChecked,
      logger,
    );
    for (const post of [...posts].reverse()) {
      await createPost(post, logger);
    }

    saveLastCheckedTime(new Date().toISOString());
  } catch (error) {
    console.error("Error during synchronization:", error);
  }
}

function processEmbed(embed: PostEmbed | undefined): string {
  if (!embed) return "";

  switch (embed.$type) {
    case "app.bsky.embed.images#view":
      return embed.images
        .map(
          (img) =>
            `<img src="${escapeHtml(img.fullsize)}" alt="${escapeHtml(img.alt)}" />`,
        )
        .join("\n");

    case "app.bsky.embed.external#view":
      return `<a href="${escapeHtml(embed.external.uri)}" target="_blank">
        ${escapeHtml(embed.external.title)}
      </a>`;

    case "app.bsky.embed.record#view":
      return `<blockquote>Quoted post: ${escapeHtml(embed.record.text)}</blockquote>`;

    default:
      return "";
  }
}

async function createPost(
  post: Post,
  logger: ReturnType<typeof initLogger>,
): Promise<void> {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  const postNumber = getNextPostNumber();
  const fileName = `${postNumber.toString().padStart(4, "0")}.html`;
  logger.info(`Creating post file: ${fileName}`);

  const content = [
    `<p>${escapeHtml(post.record.text || "")}</p>`,
    processEmbed(post.embed),
  ]
    .filter(Boolean)
    .join("\n");
  logger.info(`Post content: ${content}`);

  const rendered = template
    .replace("{title}", `/feed/${fileName.replace(".html", "")}/`)
    .replace("{date}", new Date(post.indexedAt).toISOString().split("T")[0])
    .replace(
      "{link}",
      `https://bsky.app/profile/${process.env.BLUESKY_IDENTIFIER}/post/${post.uri.split("/").pop()}`,
    )
    .replace("{content}", content);

  fs.writeFileSync(path.join(POSTS_DIR, fileName), rendered);
  logger.info(`Post file created: ${fileName}`);
}

function getNextPostNumber(): number {
  const files = fs.readdirSync(POSTS_DIR);
  const numbers = files
    .filter((f) => f.endsWith(".html") && !f.startsWith("draft_"))
    .map((f) => parseInt(f.slice(0, 4), 10));
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

main().catch(console.error);
