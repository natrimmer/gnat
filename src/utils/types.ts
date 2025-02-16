export interface BuildOptions {
  srcDir?: string;
  outDir?: string;
  clean?: boolean;
  includeDrafts?: boolean;
}

export interface ServiceTimestamps {
  bluesky_last_sync: string;
  hevy_last_sync: string;
  prod_last_build: string;
}
