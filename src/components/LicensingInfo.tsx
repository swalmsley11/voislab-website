import React from 'react';
import SEOHead from './SEOHead';
import './LegalPages.css';

const LicensingInfo: React.FC = () => {
  return (
    <>
      <SEOHead
        title="Music Licensing - VoisLab"
        description="License VoisLab's original music compositions for your projects. Commercial, sync, and exclusive licensing options available for professional audio content."
        keywords="VoisLab music licensing, audio licensing, commercial music license, sync license, music for projects"
        url="https://voislab.com/licensing"
        type="article"
      />
      <div className="legal-page">
        <div className="legal-container">
          <h1 className="legal-title">Licensing Information</h1>
          <div className="legal-content">
            <p className="legal-updated">
              Last updated: {new Date().toLocaleDateString()}
            </p>

            <section className="legal-section">
              <h2>Music Licensing Overview</h2>
              <p>
                VoisLab offers various licensing options for our original audio
                content. All music and audio compositions are created by our
                team and are available for licensing under specific terms and
                conditions.
              </p>
            </section>

            <section className="legal-section">
              <h2>Available License Types</h2>

              <div className="license-type">
                <h3>Personal Use License</h3>
                <p>Free for personal, non-commercial use including:</p>
                <ul>
                  <li>Personal listening and enjoyment</li>
                  <li>Private events and gatherings</li>
                  <li>Educational purposes (non-commercial)</li>
                  <li>Personal video projects (non-monetized)</li>
                </ul>
              </div>

              <div className="license-type">
                <h3>Commercial License</h3>
                <p>Required for any commercial use including:</p>
                <ul>
                  <li>Business presentations and marketing materials</li>
                  <li>Commercial video production</li>
                  <li>Advertising and promotional content</li>
                  <li>Retail and hospitality background music</li>
                  <li>Podcast and broadcast media</li>
                </ul>
                <p>
                  <strong>Contact us for pricing and terms.</strong>
                </p>
              </div>

              <div className="license-type">
                <h3>Sync License</h3>
                <p>For synchronization with visual media:</p>
                <ul>
                  <li>Film and television productions</li>
                  <li>Online video content</li>
                  <li>Video games and interactive media</li>
                  <li>Streaming platform content</li>
                </ul>
                <p>
                  <strong>
                    Custom licensing available based on project scope.
                  </strong>
                </p>
              </div>

              <div className="license-type">
                <h3>Exclusive License</h3>
                <p>For exclusive rights to specific tracks:</p>
                <ul>
                  <li>Exclusive commercial use rights</li>
                  <li>Customization and modification rights</li>
                  <li>Territory-specific exclusivity</li>
                  <li>Extended usage periods</li>
                </ul>
                <p>
                  <strong>Premium pricing for exclusive arrangements.</strong>
                </p>
              </div>
            </section>

            <section className="legal-section">
              <h2>Rights and Restrictions</h2>
              <h3>What You Get</h3>
              <ul>
                <li>High-quality audio files in multiple formats</li>
                <li>Written license agreement specifying usage rights</li>
                <li>Technical support for implementation</li>
                <li>Metadata and attribution information</li>
              </ul>

              <h3>What You Cannot Do</h3>
              <ul>
                <li>Resell or redistribute the original audio files</li>
                <li>Claim ownership or authorship of the content</li>
                <li>Use content beyond the scope of your license</li>
                <li>Remove or alter copyright notices</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>Attribution Requirements</h2>
              <p>Proper attribution is required for all licensed content:</p>
              <div className="attribution-example">
                <p>
                  <strong>Standard Attribution:</strong>
                </p>
                <p>
                  "Music by VoisLab - [Track Title] - Licensed under [License
                  Type]"
                </p>
              </div>
              <p>
                For commercial projects, attribution placement and format may be
                negotiated as part of the licensing agreement.
              </p>
            </section>

            <section className="legal-section">
              <h2>Custom Compositions</h2>
              <p>
                VoisLab also offers custom music composition services for
                specific projects. Custom work includes:
              </p>
              <ul>
                <li>Original compositions tailored to your needs</li>
                <li>Multiple revisions and refinements</li>
                <li>Various format deliverables</li>
                <li>Flexible licensing terms</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>Licensing Process</h2>
              <ol>
                <li>Contact us with your project details and requirements</li>
                <li>Receive a custom quote and license agreement</li>
                <li>Review and approve the terms</li>
                <li>Complete payment and receive your licensed content</li>
                <li>
                  Implement with confidence knowing you're properly licensed
                </li>
              </ol>
            </section>

            <section className="legal-section">
              <h2>Contact for Licensing</h2>
              <p>Ready to license our music for your project? Get in touch:</p>
              <p>Email: licensing@voislab.com</p>
              <p>Phone: +1 (555) 123-4567</p>
              <p>
                Please include details about your project, intended use,
                distribution scope, and timeline for the fastest response.
              </p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
};

export default LicensingInfo;
