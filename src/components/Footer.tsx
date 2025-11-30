import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

interface FooterProps {
  className?: string;
}

const Footer: React.FC<FooterProps> = ({ className = '' }) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer id="contact" className={`footer ${className}`}>
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-section">
            <h4 className="footer-heading">Streams</h4>
            <div className="streaming-links">
              <a
                href="https://open.spotify.com/artist/1Cp7uD6jiuEvZn5TonN2qI"
                className="streaming-link"
                aria-label="Spotify"
                target="_blank"
                rel="noopener noreferrer"
              >
                Spotify
              </a>
              <a
                href="https://music.apple.com/us/artist/voislab/1852802090"
                className="streaming-link"
                aria-label="Apple Music"
                target="_blank"
                rel="noopener noreferrer"
              >
                Apple Music
              </a>
              <a
                href="https://music.amazon.com/artists/B0G27P62RR/voislab"
                className="streaming-link"
                aria-label="Amazon Music"
                target="_blank"
                rel="noopener noreferrer"
              >
                Amazon Music
              </a>
              <a
                href="https://tidal.com/artist/69803048"
                className="streaming-link"
                aria-label="Tidal"
                target="_blank"
                rel="noopener noreferrer"
              >
                Tidal
              </a>
            </div>
          </div>

          <div className="footer-section">
            <h4 className="footer-heading">Social</h4>
            <div className="social-links">
              <a
                href="https://x.com/voislab_ai"
                className="social-link"
                aria-label="X (Twitter)"
                target="_blank"
                rel="noopener noreferrer"
              >
                X
              </a>
              <a
                href="https://www.facebook.com/voislab25/"
                className="social-link"
                aria-label="Facebook"
                target="_blank"
                rel="noopener noreferrer"
              >
                Facebook
              </a>
              <a
                href="https://www.tiktok.com/@voislab"
                className="social-link"
                aria-label="TikTok"
                target="_blank"
                rel="noopener noreferrer"
              >
                TikTok
              </a>
              <a
                href="#"
                className="social-link"
                aria-label="Instagram"
                target="_blank"
                rel="noopener noreferrer"
              >
                Instagram
              </a>
            </div>
          </div>

          <div className="footer-section">
            <h4 className="footer-heading">Legal</h4>
            <div className="legal-links">
              <Link to="/privacy" className="legal-link">
                Privacy Policy
              </Link>
              <Link to="/terms" className="legal-link">
                Terms of Use
              </Link>
              <Link to="/licensing" className="legal-link">
                Licensing
              </Link>
            </div>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="copyright">
            © {currentYear} VoisLab. All rights reserved. All audio content is
            protected by copyright law.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
