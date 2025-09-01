
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ImageUpload from '../components/ImageUpload';

interface UploadPageProps {
  darkMode: boolean;
}

const UploadPage: React.FC<UploadPageProps> = ({ darkMode }) => {
  const navigate = useNavigate();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleImageUpload = (file: File) => {
    setImageFile(file);
    // Here you would typically upload to backend
  };

  const handleProceed = () => {
    if (imageFile) {
      navigate('/editor', { 
        state: { 
          imageUrl: URL.createObjectURL(imageFile) 
        } 
      });
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'dark:bg-gray-900 dark:text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-500 to-purple-600 dark:from-blue-400 dark:to-purple-500 bg-clip-text text-transparent">
            AI Image Editor
          </h1>
          <p className={`text-lg ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Transform your images with the power of artificial intelligence
          </p>
        </div>

        {/* Upload Section */}
        <div className={`max-w-2xl mx-auto rounded-2xl overflow-hidden transition-all duration-300 ${
          darkMode 
            ? 'bg-gray-800/80 backdrop-blur-sm shadow-2xl border border-gray-700' 
            : 'bg-white/90 backdrop-blur-sm shadow-xl border border-gray-100'
        }`}>
          <div className="p-8">
            <ImageUpload 
              onImageUpload={handleImageUpload} 
              darkMode={darkMode}
              isDragging={isDragging}
              setIsDragging={setIsDragging}
            />
            
            {imageFile && (
              <div className="mt-6 text-center">
                <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
                  darkMode 
                    ? 'bg-green-900/30 text-green-300 border border-green-800/50' 
                    : 'bg-green-50 text-green-700 border border-green-100'
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Image selected: {imageFile.name}
                </div>
                
                <button 
                  onClick={handleProceed}
                  disabled={!imageFile}
                  className={`mt-6 w-full sm:w-auto px-8 py-3 rounded-xl font-medium transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    imageFile 
                      ? darkMode 
                        ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg' 
                        : 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-md'
                      : darkMode 
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <span className="flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                    Proceed to Editor
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Features */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: "AI-Powered Editing",
              description: "Advanced artificial intelligence algorithms enhance and transform your images automatically.",
              icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
            },
            {
              title: "One-Click Enhancements",
              description: "Transform your photos with a single click using our intelligent enhancement tools.",
              icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z"
            },
            {
              title: "Real-Time Preview",
              description: "See instant results as you edit, with smooth transitions and high-quality rendering.",
              icon: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            }
          ].map((feature, index) => (
            <div 
              key={index}
              className={`p-6 rounded-xl transition-all duration-300 ${
                darkMode 
                  ? 'bg-gray-800/60 hover:bg-gray-800' 
                  : 'bg-white/80 hover:bg-gray-50 backdrop-blur-sm shadow-md hover:shadow-lg'
              }`}
            >
              <div className={`w-12 h-12 mb-4 rounded-lg flex items-center justify-center ${
                darkMode 
                  ? 'bg-blue-900/30 text-blue-400' 
                  : 'bg-blue-100 text-blue-600'
              }`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={feature.icon} />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UploadPage;
