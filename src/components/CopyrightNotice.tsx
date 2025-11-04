import React from 'react';
import './CopyrightNotice.css';

interface CopyrightNoticeProps {
  trackTitle?: string;
  year?: number;
  className?: string;
  variant?: 'inline' | 'block' | 'minimal';
}

const CopyrightNotice: React.FC<CopyrightNoticeProps> = ({
  trackTitle,
  year = new Date().getFullYear(),
  className = '',
  variant = 'inline'
}) => {
  const getCopyrightText = () => {
    if (trackTitle) {
      return `© ${year} VoisLab. "${trackTitle}" - All rights reserved.`;
    }
    return `© ${year} VoisLab. All rights reserved.`;
  };

  const getLicenseText = () => {
    if (trackTitle) {
      return 'This audio content is protected by copyright law. Unauthorized reproduction, distribution, or commercial use is strictly prohibited.';
    }
    return 'All audio content is protected by copyright law and used under license.';
  };

  return (
    <div className={`copyright-notice copyright-notice--${variant} ${className}`}>
      <div className="copyright-text">
        <span className="copyright-symbol">©</span>
        <span className="copyright-content">{getCopyrightText()}</span>
      </div>
      {variant === 'block' && (
        <div className="license-text">
          {getLicenseText()}
        </div>
      )}
      {variant === 'block' && (
        <div className="license-links">
          <a href="/licensing" className="license-link">
            Licensing Information
          </a>
          <span className="separator">•</span>
          <a href="/terms" className="license-link">
            Terms of Use
          </a>
        </div>
      )}
    </div>
  );
};

export default CopyrightNotice;