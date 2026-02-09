import React, { Suspense } from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Hero from './components/Hero';
import MusicLibrary from './components/MusicLibrary';
import NewReleases from './components/NewReleases';
import About from './components/About';
import Footer from './components/Footer';
import SEOHead from './components/SEOHead';
import { AudioTrackWithUrls } from './types/audio-track';

// Lazy load pages for better performance
const PrivacyPolicy = React.lazy(() => import('./components/PrivacyPolicy'));
const TermsOfUse = React.lazy(() => import('./components/TermsOfUse'));
const LicensingInfo = React.lazy(() => import('./components/LicensingInfo'));

// Music Library Page component
const MusicLibraryPage: React.FC = () => {
  const musicLibraryStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'MusicPlaylist',
    name: 'VoisLab Music Library',
    description:
      'Browse the complete collection of original compositions and audio creations by VoisLab.',
    url: 'https://voislab.com/music',
    creator: {
      '@type': 'MusicGroup',
      name: 'VoisLab',
    },
  };

  return (
    <>
      <SEOHead
        title="Music Library - VoisLab"
        description="Browse the complete collection of original compositions and audio creations by VoisLab. Stream high-quality ambient, electronic, and atmospheric tracks."
        keywords="VoisLab music library, ambient music, electronic music, original compositions, streaming, music catalog"
        url="https://voislab.com/music"
        type="website"
        structuredData={musicLibraryStructuredData}
      />
      <MusicLibrary fallbackTracks={sampleTracks} />
    </>
  );
};

// Import test integration for development
// TEMPORARILY DISABLED: Tests use deprecated AWS SDK services
// import './test-integration';

// Import analytics and monitoring
import { voisLabAnalytics } from './utils/analytics';
import './utils/monitoring'; // Initialize monitoring service

// Sample data for demonstration and fallback
const sampleTracks: AudioTrackWithUrls[] = [
  {
    id: '1',
    title: 'Ethereal Waves',
    fileUrl: 'ethereal-waves.mp3',
    secureUrl: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav', // Sample audio URL
    duration: 180,
    description:
      'A dreamy ambient composition featuring layered synthesizers and ethereal pads.',
    createdDate: new Date('2024-01-15'),
    genre: 'Ambient',
    tags: ['atmospheric', 'dreamy', 'synthesizer'],
    streamingLinks: [
      {
        platform: 'spotify',
        url: 'https://open.spotify.com/track/example1',
        displayName: 'Spotify',
      },
      {
        platform: 'soundcloud',
        url: 'https://soundcloud.com/voislab/ethereal-waves',
        displayName: 'SoundCloud',
      },
    ],
  },
  {
    id: '2',
    title: 'Urban Pulse',
    fileUrl: 'urban-pulse.mp3',
    secureUrl: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav', // Sample audio URL
    duration: 240,
    description:
      'An energetic electronic track with driving beats and urban soundscapes.',
    createdDate: new Date('2024-02-03'),
    genre: 'Electronic',
    tags: ['energetic', 'urban', 'beats'],
    streamingLinks: [
      {
        platform: 'apple-music',
        url: 'https://music.apple.com/us/album/urban-pulse/example2',
        displayName: 'Apple Music',
      },
    ],
  },
  {
    id: '3',
    title: 'Midnight Reflections',
    fileUrl: 'midnight-reflections.mp3',
    secureUrl: 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav', // Sample audio URL
    duration: 210,
    description:
      'A contemplative piece perfect for late-night listening and introspection.',
    createdDate: new Date('2024-01-28'),
    genre: 'Ambient',
    tags: ['contemplative', 'night', 'peaceful'],
    streamingLinks: [
      {
        platform: 'bandcamp',
        url: 'https://voislab.bandcamp.com/track/midnight-reflections',
        displayName: 'Bandcamp',
      },
      {
        platform: 'youtube',
        url: 'https://youtube.com/watch?v=example3',
        displayName: 'YouTube',
      },
    ],
  },
];

// Home page component
const HomePage: React.FC = () => {
  const homeStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'MusicGroup',
    name: 'VoisLab',
    url: 'https://voislab.com',
    description:
      'Professional audio content creation and music production services specializing in ambient, electronic, and atmospheric compositions.',
    genre: ['Ambient', 'Electronic', 'Atmospheric'],
    sameAs: [
      'https://open.spotify.com/artist/voislab',
      'https://soundcloud.com/voislab',
      'https://www.youtube.com/@voislab',
    ],
    album: sampleTracks.map((track) => ({
      '@type': 'MusicRecording',
      name: track.title,
      description: track.description,
      duration: `PT${Math.floor(track.duration / 60)}M${track.duration % 60}S`,
      genre: track.genre,
      dateCreated: track.createdDate.toISOString().split('T')[0],
    })),
  };

  return (
    <>
      <SEOHead
        title="VoisLab - Professional Audio Content Creation & Music Production"
        description="Discover original music compositions and professional audio content by VoisLab. Stream high-quality ambient, electronic, and atmospheric tracks directly on our website."
        keywords="VoisLab, music production, audio content, ambient music, electronic music, original compositions, streaming, music producer, audio creation, atmospheric music"
        url="https://voislab.com/"
        type="website"
        structuredData={homeStructuredData}
      />
      <Hero />
      <NewReleases />
      <About />
    </>
  );
};

// Loading component for lazy-loaded pages
const PageLoader: React.FC = () => (
  <div className="page-loader">
    <div className="loader-container">
      <div className="loader-spinner"></div>
      <p>Loading...</p>
    </div>
  </div>
);

function App() {
  // Track page load performance
  React.useEffect(() => {
    const startTime = performance.now();

    const handleLoad = () => {
      const loadTime = performance.now() - startTime;
      voisLabAnalytics.trackPageLoadTime(loadTime);
    };

    if (document.readyState === 'complete') {
      handleLoad();
    } else {
      window.addEventListener('load', handleLoad);
      return () => window.removeEventListener('load', handleLoad);
    }
  }, []);

  // Track route changes
  React.useEffect(() => {
    voisLabAnalytics.trackPageView();
  }, []);

  return (
    <Router>
      <div className="App">
        <Header />
        <main>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/music" element={<MusicLibraryPage />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfUse />} />
              <Route path="/licensing" element={<LicensingInfo />} />
            </Routes>
          </Suspense>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
