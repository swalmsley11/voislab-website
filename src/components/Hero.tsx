import React from 'react';
import './Hero.css';

interface HeroProps {
  className?: string;
}

const Hero: React.FC<HeroProps> = ({ className = '' }) => {
  return (
    <section className={`hero ${className}`}>
      <div className="hero-container">
        <div className="hero-content">
          <h2 className="hero-title">Welcome to VoisLab</h2>
          <p className="hero-description">
            By day, I architect cloud solutions at AWS. By night, I architect
            music—and the autonomous business that powers it. VoisLab is my
            proving ground for agentic operations: AI agents handling
            distribution, social media, and admin while I create. One artist.
            Zero employees. Infinite potential.
          </p>
          <div className="hero-cta">
            <a href="#music" className="cta-button primary">
              Listen Now
            </a>
            <a href="#about" className="cta-button secondary">
              Learn More
            </a>
          </div>
        </div>
        <div className="hero-visual">
          <img
            src="/voislab-banner.jpg"
            alt="VoisLab Banner"
            className="hero-banner"
          />
        </div>
      </div>
    </section>
  );
};

export default Hero;
