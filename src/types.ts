export interface VideoDetails {
  id: string;
  title: string;
  description: string;
  author: string;
  viewCount: string;
  publishDate: string;
  thumbnail: string;
  duration: number;
  transcript: string;
  visuals: string[];
  videoUrl: string;
}

export interface PlaylistDetails {
  type: 'playlist';
  title: string;
  author: string;
  videoCount: number;
  videos: Array<{
    id: string;
    title: string;
    thumbnail: string;
    url: string;
    duration: string;
  }>;
}

export type ExtractionResult = { type: 'video' } & VideoDetails | PlaylistDetails;
