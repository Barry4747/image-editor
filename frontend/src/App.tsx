import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import UploadPage from './pages/UploadPage';
import EditorPage from './pages/EditorPage';
import JobProgressPage from './pages/JobProgressPage';

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/editor" element={<EditorPage />} />
        <Route path="/job/:jobId" element={<JobProgressPage />} />
      </Routes>
    </Router>
  );
};

export default App;