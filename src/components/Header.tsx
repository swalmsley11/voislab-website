import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Header.css';

interface HeaderProps {
  className?: string;
}

const Header: React.FC<HeaderProps> = ({ className = '' }) => {
  const location = useLocation();
  const isHomePage = location.pathname === '/';

  return (
    <header className={`header ${className}`}>
      <div className="header-container">
        <div className="header-brand">
          <Link to="/" className="brand-link">
            <h1 className="header-title">VoisLab</h1>
          </Link>
          <span className="header-tagline">
            Built different. Literally autonomous.
          </span>
        </div>
        <nav className="header-nav">
          {isHomePage ? (
            <a href="#new-releases" className="nav-link">
              New Releases
            </a>
          ) : (
            <Link to="/#new-releases" className="nav-link">
              New Releases
            </Link>
          )}
          <Link to="/music" className="nav-link">
            Music Library
          </Link>
          {isHomePage ? (
            <a href="#about" className="nav-link">
              About
            </a>
          ) : (
            <Link to="/#about" className="nav-link">
              About
            </Link>
          )}
          {isHomePage ? (
            <a href="#contact" className="nav-link">
              Contact
            </a>
          ) : (
            <Link to="/#contact" className="nav-link">
              Contact
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
