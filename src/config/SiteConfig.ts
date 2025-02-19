import path from "path";
import { BuildOptions } from "./types";

export class SiteConfig {
  private static instance: SiteConfig;
  private constructor(
    private config: {
      srcDir: string;
      outDir: string;
      componentsDir: string;
      includeDrafts: boolean;
      clean: boolean;
    },
  ) {}

  static initialize(options: BuildOptions = {}) {
    if (!SiteConfig.instance) {
      const {
        srcDir = "./src",
        outDir = "./public",
        includeDrafts = false,
        clean = true,
      } = options;

      SiteConfig.instance = new SiteConfig({
        srcDir,
        outDir,
        componentsDir: path.join(srcDir, "components"),
        includeDrafts,
        clean,
      });
    }
    return SiteConfig.instance;
  }

  static getInstance(): SiteConfig {
    if (!SiteConfig.instance) {
      throw new Error("SiteConfig must be initialized before use");
    }
    return SiteConfig.instance;
  }

  getContentPath(type: string): string {
    return path.join(this.config.srcDir, "content", type);
  }

  getOutputPath(type: string, ...segments: string[]): string {
    return path.join(this.config.outDir, type, ...segments);
  }

  get componentsDir(): string {
    return this.config.componentsDir;
  }

  get includeDrafts(): boolean {
    return this.config.includeDrafts;
  }

  get clean(): boolean {
    return this.config.clean;
  }
}
