import './App.css';
import Header from './components/Header';
import Hero from './components/Hero';
import MusicLibrary from './components/MusicLibrary';
import Footer from './components/Footer';
import { AudioTrackWithUrls } from './types/audio-track';

// Import test integration for development
import './test-integration';

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

function App() {
  return (
    <div className="App">
      <Header />
      <main>
        <Hero />
        <MusicLibrary fallbackTracks={sampleTracks} />
      </main>
      <Footer />
    </div>
  );
}

export default App;
