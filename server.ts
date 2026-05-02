import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { Innertube, UniversalCache } from 'youtubei.js';
import { YoutubeTranscript } from 'youtube-transcript';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Innertube once
  const youtube = await Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true
  });

  app.use(cors());
  app.use(express.json());

  // API to fetch video or playlist details
  app.post('/api/extract', async (req, res) => {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    try {
      // Try to determine if it's a playlist or video
      // youtubei.js handle this better via resolve
      
      let videoId: string | null = null;
      let playlistId: string | null = null;

      try {
        if (url.includes('list=')) {
          const match = url.match(/[?&]list=([^#\&\?]+)/);
          playlistId = match ? match[1] : null;
        } else {
          // Try to extract video ID
          const match = url.match(/(?:v=|\/|be\/|embed\/)([0-9A-Za-z_-]{11})/);
          videoId = match ? match[1] : null;
        }
      } catch (e) {
        console.error('URL parsing error:', e);
      }

      if (playlistId) {
        const playlist: any = await youtube.getPlaylist(playlistId);
        return res.json({
          type: 'playlist',
          title: playlist.endpoint.payload.title || 'Unknown Playlist',
          author: playlist.header?.author?.name || 'Unknown Author',
          videoCount: playlist.videos.length,
          videos: playlist.videos.map((v: any) => ({
            id: v.id,
            title: v.title?.toString(),
            thumbnail: v.thumbnails?.[0]?.url,
            url: `https://www.youtube.com/watch?v=${v.id}`,
            duration: v.duration?.toString() || '??:??'
          }))
        });
      }

      if (videoId) {
        const videoInfo = await youtube.getInfo(videoId);
        const details: any = videoInfo.basic_info;

        // Try to get transcript
        let transcript = 'Transcript not available for this content.';
        try {
          // Try youtube-transcript first
          const transcriptData = await YoutubeTranscript.fetchTranscript(videoId);
          transcript = transcriptData.map(t => t.text).join(' ');
        } catch (e: any) {
          // If it's a known "transcript disabled" error, we can be quieter
          if (e.message?.includes('Transcript is disabled')) {
            console.log(`Transcript disabled for video: ${videoId}`);
          } else {
            console.warn(`Transcript fetch via youtube-transcript failed for ${videoId}, trying youtubei.js...`);
            try {
               // Check if captions exist in videoInfo
               const captions = (videoInfo as any).captions;
               if (captions) {
                 const transcriptData: any = await videoInfo.getTranscript();
                 if (transcriptData && transcriptData.transcript?.content?.body?.initial_segments) {
                    transcript = transcriptData.transcript.content.body.initial_segments
                      .map((s: any) => s.snippet.text)
                      .join(' ');
                 }
               }
            } catch (innerE: any) {
              console.warn(`All transcript methods failed for ${videoId}: ${innerE.message}`);
            }
          }
        }

        return res.json({
          type: 'video',
          id: details.id,
          title: details.title,
          description: details.short_description || details.description || 'No description available',
          author: details.author,
          viewCount: details.view_count,
          publishDate: details.is_live ? 'Live' : 'N/A', // publish date is harder to get in basic_info
          thumbnail: details.thumbnail?.[details.thumbnail.length - 1]?.url,
          duration: details.duration,
          transcript,
          visuals: details.thumbnail?.map((t: any) => t.url) || [],
          videoUrl: `https://www.youtube.com/watch?v=${details.id}`
        });
      }

      return res.status(400).json({ error: 'Invalid YouTube URL or ID not found' });

    } catch (error: any) {
      console.error('Extraction error:', error);
      res.status(500).json({ error: error.message || 'Failed to extract content' });
    }
  });

  // API to fetch transcript specifically
  app.get('/api/transcript/:videoId', async (req, res) => {
    try {
      const { videoId } = req.params;
      const transcript = await YoutubeTranscript.fetchTranscript(videoId);
      res.json(transcript);
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to fetch transcript' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
