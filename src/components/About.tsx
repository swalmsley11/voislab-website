import React from 'react';
import './About.css';

interface AboutProps {
  className?: string;
}

const About: React.FC<AboutProps> = ({ className = '' }) => {
  return (
    <section id="about" className={`about ${className}`}>
      <div className="about-container">
        <h2>About VoisLab</h2>
        <p>
          VoisLab is where human creativity meets autonomous execution. Founded 
          by a musician turned cloud architect turned independent artist, we're 
          pioneering agentic business operations in the music industry. Using AI 
          agents to handle everything from distribution to social media, we prove 
          that a business of one can operate with the efficiency of many.

        </p>
        <p>
          VoisLab isn't just making music—we're redefining what's possible when 
          you architect your art like you architect cloud systems.
        </p>
        <blockquote className="about-quote">
          I work at AWS and I'm using Bedrock Agents to run my music business 
          while I sleep.
        </blockquote>
      </div>
    </section>
  );
};

export default About;
