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
            Crafting unique audio experiences through innovative sound design and music production. 
            Explore a collection of original compositions and discover the artistry behind each track.
            Now with automated CI/CD deployment!
          </p>
          <div className="hero-cta">
            <button className="cta-button primary">
              Listen Now
            </button>
            <button className="cta-button secondary">
              Learn More
            </button>
          </div>
        </div>
        <div className="hero-visual">
          <div className="audio-wave-placeholder">
            <div className="wave-bar"></div>
            <div className="wave-bar"></div>
            <div className="wave-bar"></div>
            <div className="wave-bar"></div>
            <div className="wave-bar"></div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;