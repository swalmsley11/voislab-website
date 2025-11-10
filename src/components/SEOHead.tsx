import React from 'react';
import { Helmet } from 'react-helmet-async';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'music.song' | 'music.album';
  structuredData?: object;
}

const SEOHead: React.FC<SEOHeadProps> = ({
  title = 'VoisLab - Professional Audio Content Creation & Music Production',
  description = 'Discover original music compositions and professional audio content by VoisLab. Stream high-quality ambient, electronic, and atmospheric tracks. Professional music production services available.',
  keywords = 'VoisLab, music production, audio content, ambient music, electronic music, original compositions, streaming, music producer, audio creation',
  image = 'https://voislab.com/images/voislab-social-preview.jpg',
  url = 'https://voislab.com/',
  type = 'website',
  structuredData,
}) => {
  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />

      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={url} />
      <meta property="twitter:title" content={title} />
      <meta property="twitter:description" content={description} />
      <meta property="twitter:image" content={image} />

      {/* Canonical URL */}
      <link rel="canonical" href={url} />

      {/* Structured Data */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
    </Helmet>
  );
};

export default SEOHead;
