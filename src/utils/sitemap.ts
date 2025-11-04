// Sitemap generation utility for VoisLab website
export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

export function generateSitemap(urls: SitemapUrl[]): string {
  const xmlHeader = '<?xml version="1.0" encoding="UTF-8"?>';
  const urlsetOpen = '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  const urlsetClose = '</urlset>';
  
  const urlEntries = urls.map(url => {
    let entry = `  <url>\n    <loc>${url.loc}</loc>`;
    
    if (url.lastmod) {
      entry += `\n    <lastmod>${url.lastmod}</lastmod>`;
    }
    
    if (url.changefreq) {
      entry += `\n    <changefreq>${url.changefreq}</changefreq>`;
    }
    
    if (url.priority !== undefined) {
      entry += `\n    <priority>${url.priority}</priority>`;
    }
    
    entry += '\n  </url>';
    return entry;
  }).join('\n');
  
  return `${xmlHeader}\n${urlsetOpen}\n${urlEntries}\n${urlsetClose}`;
}

export function getDefaultSitemapUrls(): SitemapUrl[] {
  const baseUrl = 'https://voislab.com';
  const currentDate = new Date().toISOString().split('T')[0];
  
  return [
    {
      loc: baseUrl,
      lastmod: currentDate,
      changefreq: 'weekly',
      priority: 1.0
    },
    {
      loc: `${baseUrl}/privacy`,
      lastmod: currentDate,
      changefreq: 'monthly',
      priority: 0.3
    },
    {
      loc: `${baseUrl}/terms`,
      lastmod: currentDate,
      changefreq: 'monthly',
      priority: 0.3
    },
    {
      loc: `${baseUrl}/licensing`,
      lastmod: currentDate,
      changefreq: 'monthly',
      priority: 0.7
    }
  ];
}

// Generate sitemap for audio tracks
export function generateAudioTrackSitemapUrls(tracks: any[]): SitemapUrl[] {
  const baseUrl = 'https://voislab.com';
  
  return tracks.map(track => ({
    loc: `${baseUrl}/track/${track.id}`,
    lastmod: new Date(track.createdDate).toISOString().split('T')[0],
    changefreq: 'monthly' as const,
    priority: 0.8
  }));
}

// Create a complete sitemap
export function createCompleteSitemap(audioTracks: any[] = []): string {
  const defaultUrls = getDefaultSitemapUrls();
  const trackUrls = generateAudioTrackSitemapUrls(audioTracks);
  
  return generateSitemap([...defaultUrls, ...trackUrls]);
}