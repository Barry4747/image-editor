import React from 'react';

interface UploadPageProps {
  darkMode: boolean;
}

const Footer: React.FC<UploadPageProps> = ({ darkMode }) => {
  return (
    <footer className={`py-6 border-t transition-colors duration-300 ${
      darkMode ? 'border-gray-800' : 'border-gray-200'
    }`}>
      <div className="container mx-auto px-4 text-center">
        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          © 2025 AI Image Editor. All rights reserved.
        </p>
      </div>
    </footer>
  );
};

export default Footer;