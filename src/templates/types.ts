export interface PageData {
  content: string;
  template: string;
  title?: string;
  date?: string;
  updated?: string;
  version?: string;
  link?: string;
  bluesky?: string;
  [key: string]: string | undefined;
}
