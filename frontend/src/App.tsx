import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import UploadPage from './pages/UploadPage';
import EditorPage from './pages/EditorPage';
import JobProgressPage from './pages/JobProgressPage';
import TextToImagePage from './pages/GeneratePage';
import Header from './components/Header';
import Footer from './components/Footer';
import './index.css';
import { AuthProvider } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import { initSessionId } from './utils/session';
import GalleryPage from "./pages/GalleryPage";

const AppContent = () => {
  const [darkMode, setDarkMode] = useState(false);
  const location = useLocation();

  useEffect(() => {
    initSessionId();
  }, []);

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDarkMode(prefersDark);
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode(!darkMode);

  const hideHeaderFooter = location.pathname.startsWith('/job/');

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        darkMode ? 'dark:bg-gray-900 dark:text-white' : 'bg-gray-50 text-gray-900'
      }`}
    >
      {!hideHeaderFooter && (
        <Header darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
      )}

      <main className="flex-grow p-4">
        <Routes>
          <Route path="/" element={<UploadPage darkMode={darkMode} />} />
          <Route path="/editor" element={<EditorPage darkMode={darkMode} />} />
          <Route path="/job/:jobId" element={<JobProgressPage darkMode={darkMode} />} />
          <Route path="/text-to-image" element={<TextToImagePage darkMode={darkMode} />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
        </Routes>
      </main>

      {!hideHeaderFooter && <Footer darkMode={darkMode} />}
    </div>
  );
};

const App = () => {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
};

export default App;