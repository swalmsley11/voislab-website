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
    altText: 'Silicon Horizon on Amazon Music',
  },
  {
    id: 'silicon-horizon-amazon',
    imageUrl: '/images/hype_silicon-horizion_amazon-music.png',
    linkUrl: 'https://music.amazon.com/albums/B0G279V8SV?ref=AM4APC_TR_S_en_US_B0G27P62RR_lmIHs0C&trackAsin=B0G275NK6V',
    altText: 'Silicon Horizon on Amazon Music',
  },
  {
    id: 'i-forgive-you-apple',
    imageUrl: '/images/hype_i-forgive-you_apple-music.png',
    linkUrl: 'https://music.lnk.to/1kV0Qs',
    altText: 'I Forgive You on Apple Music',
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
