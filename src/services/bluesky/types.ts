import { AppBskyFeedDefs } from "@atproto/api";

export interface ImageEmbed {
  $type: "app.bsky.embed.images#view";
  images: {
    fullsize: string;
    alt: string;
  }[];
  [key: string]: unknown;
}

export interface ExternalEmbed {
  $type: "app.bsky.embed.external#view";
  external: {
    uri: string;
    title: string;
  };
  [key: string]: unknown;
}

export interface RecordEmbed {
  $type: "app.bsky.embed.record#view";
  record: {
    text: string;
  };
  [key: string]: unknown;
}

export type PostEmbed = ImageEmbed | ExternalEmbed | RecordEmbed;

export interface Post extends AppBskyFeedDefs.PostView {
  embed?: PostEmbed;
  record: {
    text?: string;
  };
}
