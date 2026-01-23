import React from 'react';
import './NewReleases.css';

interface HypeCard {
  id: string;
  imageUrl: string;
  linkUrl: string;
  altText: string;
}

const hypeCards: HypeCard[] = [
  {
    id: 'voislab-spotify',
    imageUrl: '/images/hype_voislab-spotify.jpeg',
    linkUrl: 'https://open.spotify.com/artist/1Cp7uD6jiuEvZn5TonN2qI',
    altText: 'VoisLab on Spotify',
  },
  {
    id: 'human-in-the-loop-youtube',
    imageUrl: '/images/hype_human-in-the-loop.png',
    linkUrl:
      'https://music.youtube.com/playlist?list=OLAK5uy_n2fdXFgysXC-6QG0F1s1CR9LU8WeJbNXY',
    altText: 'Human in the Loop on YouTube Music',
  },
  {
    id: 'blocks-of-sorrow-apple',
    imageUrl: '/images/hype_blocks-of-sorrow_apple-music.png',
    linkUrl: 'https://music.lnk.to/F5oat6',
    altText: 'Blocks of Sorrow on Apple Music',
  },
];

const NewReleases: React.FC = () => {
  // Filter out cards without images
  const activeCards = hypeCards.filter((card) => card.imageUrl);

  return (
    <section className="new-releases" id="new-releases">
      <div className="new-releases-container">
        <h2 className="new-releases-title">New Releases</h2>
        <p className="new-releases-description">
          Check out my latest tracks on your favorite streaming platform
        </p>

        <div className="hype-cards-grid">
          {activeCards.map((card) => (
            <a
              key={card.id}
              href={card.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hype-card-link"
              aria-label={card.altText}
            >
              <div className="hype-card">
                <img
                  src={card.imageUrl}
                  alt={card.altText}
                  className="hype-card-image"
                  loading="lazy"
                />
              </div>
            </a>
          ))}
        </div>

        <div className="browse-all-container">
          <a href="/music" className="browse-all-link">
            Browse Full Music Library →
          </a>
        </div>
      </div>
    </section>
  );
};

export default NewReleases;
