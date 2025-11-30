import React from 'react';
import './Header.css';

interface HeaderProps {
  className?: string;
}

const Header: React.FC<HeaderProps> = ({ className = '' }) => {
  return (
    <header className={`header ${className}`}>
      <div className="header-container">
        <div className="header-brand">
          <h1 className="header-title">VoisLab</h1>
          <span className="header-tagline">Built different. Literally autonomous.</span>
        </div>
        <nav className="header-nav">
          <a href="#music" className="nav-link">
            Music
          </a>
          <a href="#about" className="nav-link">
            About
          </a>
          <a href="#contact" className="nav-link">
            Contact
          </a>
        </nav>
      </div>
    </header>
  );
};

export default Header;
