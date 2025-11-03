import React from 'react';
import './Footer.css';

interface FooterProps {
  className?: string;
}

const Footer: React.FC<FooterProps> = ({ className = '' }) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className={`footer ${className}`}>
      <div className="footer-container">
        <div className="footer-content">
          <div className="footer-section">
            <h3 className="footer-title">VoisLab</h3>
            <p className="footer-description">
              Professional audio content creation and music production services.
            </p>
          </div>

          <div className="footer-section">
            <h4 className="footer-heading">Connect</h4>
            <div className="social-links">
              <a href="#" className="social-link" aria-label="Spotify">
                Spotify
              </a>
              <a href="#" className="social-link" aria-label="SoundCloud">
                SoundCloud
              </a>
              <a href="#" className="social-link" aria-label="YouTube">
                YouTube
              </a>
            </div>
          </div>

          <div className="footer-section">
            <h4 className="footer-heading">Legal</h4>
            <div className="legal-links">
              <a href="#privacy" className="legal-link">
                Privacy Policy
              </a>
              <a href="#terms" className="legal-link">
                Terms of Use
              </a>
              <a href="#licensing" className="legal-link">
                Licensing
              </a>
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
