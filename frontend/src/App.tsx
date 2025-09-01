import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import UploadPage from './pages/UploadPage';
import EditorPage from './pages/EditorPage';
import JobProgressPage from './pages/JobProgressPage';
import TextToImagePage from './pages/GeneratePage'
import Header from './components/Header';
import Footer from './components/Footer';
import './index.css';

const App = () => {
  const [darkMode, setDarkMode] = useState(false);
  const location = useLocation();

  // Check user preference on initial load
  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(prefersDark);
  }, []);

  // Apply dark mode class to html element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
  };

  // Hide header/footer on specific routes if needed
  const hideHeaderFooter = location.pathname.startsWith('/job/');

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'dark:bg-gray-900 dark:text-white' : 'bg-gray-50 text-gray-900'}`}>
      {!hideHeaderFooter && (
        <Header darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
      )}
      
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<UploadPage darkMode={darkMode} />} />
          <Route path="/editor" element={<EditorPage darkMode={darkMode} />} />
          <Route path="/job/:jobId" element={<JobProgressPage darkMode={darkMode} />} />
          <Route path="/text-to-image" element={<TextToImagePage darkMode={darkMode} />} />
        </Routes>
      </main>
      
      {!hideHeaderFooter && (
        <Footer darkMode={darkMode} />
      )}
    </div>
  );
};

// Wrap the main App component with Router
const AppWrapper = () => {
  return (
    <Router>
      <App />
    </Router>
  );
};

export default AppWrapper;
