import React from 'react';
import SEOHead from './SEOHead';
import './LegalPages.css';

const PrivacyPolicy: React.FC = () => {
  return (
    <>
      <SEOHead
        title="Privacy Policy - VoisLab"
        description="Learn about VoisLab's privacy policy, data collection practices, and how we protect your information when using our audio streaming services."
        keywords="VoisLab privacy policy, data protection, audio streaming privacy, music website privacy"
        url="https://voislab.com/privacy"
        type="article"
      />
      <div className="legal-page">
        <div className="legal-container">
          <h1 className="legal-title">Privacy Policy</h1>
          <div className="legal-content">
            <p className="legal-updated">
              Last updated: {new Date().toLocaleDateString()}
            </p>

            <section className="legal-section">
              <h2>Information We Collect</h2>
              <p>
                VoisLab ("we," "our," or "us") is committed to protecting your
                privacy. This Privacy Policy explains how we collect, use, and
                safeguard your information when you visit our website.
              </p>
              <ul>
                <li>Usage data (pages visited, time spent, browser type)</li>
                <li>
                  Device information (IP address, device type, operating system)
                </li>
                <li>Audio streaming preferences and playback statistics</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>How We Use Your Information</h2>
              <p>We use the collected information to:</p>
              <ul>
                <li>Provide and maintain our audio streaming services</li>
                <li>Improve user experience and website functionality</li>
                <li>Analyze usage patterns to enhance our content offerings</li>
                <li>Ensure the security and integrity of our services</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>Audio Content and Streaming</h2>
              <p>
                When you stream audio content on our website, we may collect
                information about your listening preferences, playback duration,
                and technical performance data to improve our streaming quality
                and user experience.
              </p>
            </section>

            <section className="legal-section">
              <h2>Third-Party Services</h2>
              <p>
                Our website may contain links to third-party streaming platforms
                (Spotify, Apple Music, SoundCloud, etc.). We are not responsible
                for the privacy practices of these external services. Please
                review their respective privacy policies.
              </p>
            </section>

            <section className="legal-section">
              <h2>Data Security</h2>
              <p>
                We implement appropriate security measures to protect your
                personal information. However, no method of transmission over
                the internet is 100% secure, and we cannot guarantee absolute
                security.
              </p>
            </section>

            <section className="legal-section">
              <h2>Cookies and Analytics</h2>
              <p>
                We may use cookies and similar technologies to enhance your
                browsing experience and analyze website traffic. You can control
                cookie settings through your browser preferences.
              </p>
            </section>

            <section className="legal-section">
              <h2>Contact Information</h2>
              <p>
                If you have any questions about this Privacy Policy, please
                contact us at:
              </p>
              <p>Email: privacy@voislab.com</p>
            </section>

            <section className="legal-section">
              <h2>Changes to This Policy</h2>
              <p>
                We may update this Privacy Policy from time to time. Any changes
                will be posted on this page with an updated revision date.
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
};

export default PrivacyPolicy;
