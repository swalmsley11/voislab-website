import React from 'react';
import SEOHead from './SEOHead';
import './LegalPages.css';

const TermsOfUse: React.FC = () => {
  return (
    <>
      <SEOHead
        title="Terms of Use - VoisLab"
        description="Read VoisLab's terms of use for audio content streaming, copyright information, and usage guidelines for our music and audio services."
        keywords="VoisLab terms of use, audio content terms, music streaming terms, copyright terms"
        url="https://voislab.com/terms"
        type="article"
      />
      <div className="legal-page">
        <div className="legal-container">
          <h1 className="legal-title">Terms of Use</h1>
          <div className="legal-content">
            <p className="legal-updated">
              Last updated: {new Date().toLocaleDateString()}
            </p>

            <section className="legal-section">
              <h2>Acceptance of Terms</h2>
              <p>
                By accessing and using the VoisLab website, you accept and agree
                to be bound by the terms and provision of this agreement. If you
                do not agree to abide by the above, please do not use this
                service.
              </p>
            </section>

            <section className="legal-section">
              <h2>Audio Content Usage</h2>
              <p>
                All audio content on this website is the intellectual property
                of VoisLab and is protected by copyright law. The following
                terms apply to audio content usage:
              </p>
              <ul>
                <li>
                  Personal listening and streaming for non-commercial purposes
                  is permitted
                </li>
                <li>
                  Downloading, copying, or redistributing audio content is
                  strictly prohibited
                </li>
                <li>
                  Commercial use requires explicit written permission from
                  VoisLab
                </li>
                <li>
                  Reverse engineering or attempting to extract audio files is
                  prohibited
                </li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>Copyright Protection</h2>
              <p>
                All audio tracks, compositions, and recordings on this website
                are original works created by VoisLab or used under proper
                licensing agreements. Unauthorized use, reproduction, or
                distribution of this content may result in legal action.
              </p>
            </section>

            <section className="legal-section">
              <h2>Streaming Services</h2>
              <p>
                We provide links to external streaming platforms where our
                content may be available. Use of these platforms is subject to
                their respective terms of service. VoisLab is not responsible
                for the availability or terms of third-party services.
              </p>
            </section>

            <section className="legal-section">
              <h2>Prohibited Activities</h2>
              <p>You agree not to:</p>
              <ul>
                <li>Use automated systems to access or download content</li>
                <li>Attempt to circumvent any security measures</li>
                <li>Use the website for any illegal or unauthorized purpose</li>
                <li>Interfere with or disrupt the website's functionality</li>
                <li>Violate any applicable laws or regulations</li>
              </ul>
            </section>

            <section className="legal-section">
              <h2>Limitation of Liability</h2>
              <p>
                VoisLab shall not be liable for any direct, indirect,
                incidental, special, or consequential damages resulting from the
                use or inability to use this website or its content.
              </p>
            </section>

            <section className="legal-section">
              <h2>Modifications</h2>
              <p>
                VoisLab reserves the right to modify these terms at any time.
                Changes will be effective immediately upon posting. Continued
                use of the website constitutes acceptance of modified terms.
              </p>
            </section>

            <section className="legal-section">
              <h2>Contact Information</h2>
              <p>
                For questions regarding these Terms of Use or licensing
                inquiries, please contact:
              </p>
              <p>Email: legal@voislab.com</p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
};

export default TermsOfUse;
