import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import MaskingCanvas from '../components/MaskingCanvas';
import client from '../api/axiosClient';
import './styles/EditorPage.css';

interface LocationState {
  imageUrl: string;
}

interface EditorPageProps {
  darkMode: boolean;
}

const EditorPage: React.FC<EditorPageProps> = ({ darkMode }) => {
  const { state } = useLocation() as { state: LocationState };
  const navigate = useNavigate();

  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [prompt, setPrompt] = useState('');
  const [maskData, setMaskData] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Models
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Upscalers
  const [upscalers, setUpscalers] = useState<string[]>([]);
  const [selectedUpscaler, setSelectedUpscaler] = useState<string>('');
  const [enableUpscaler, setEnableUpscaler] = useState(true);

  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [strength, setStrength] = useState(0.75);
  const [guidanceScale, setGuidanceScale] = useState(9.5);
  const [steps, setSteps] = useState(40);
  const [passes, setPasses] = useState(4);
  const [seed, setSeed] = useState('');
  const [finishModels, setFinishModels] = useState<string[]>([]);
  const [selectedFinishModel, setSelectedFinishModel] = useState('None');
  const [negativePrompt, setNegativePrompt] = useState('');

  // Load image from state
  useEffect(() => {
    if (!state?.imageUrl) {
      navigate('/');
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = state.imageUrl;
    img.onload = () => {
      const MAX_WIDTH = 1024;
      const MAX_HEIGHT = 1024;
      let { width, height } = img;
      const ratio = Math.min(MAX_WIDTH / width, MAX_HEIGHT / height, 1);
      width *= ratio;
      height *= ratio;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, width, height);

      const scaledImg = new Image();
      scaledImg.src = canvas.toDataURL('image/png');
      scaledImg.onload = () => setBaseImage(scaledImg);
    };
  }, [state, navigate]);

  // Fetch models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await client.get('/api/models/');
        setModels(res.data.models || []);
        if (res.data.models?.length > 0) setSelectedModel(res.data.models[0]);
        setFinishModels(['None', ...(res.data.models || [])]);
        setSelectedFinishModel('None');
      } catch (err) {
        console.error('Failed to fetch models:', err);
      }
    };
    fetchModels();
  }, []);

  // Fetch upscalers
  useEffect(() => {
    const fetchUpscalers = async () => {
      try {
        const res = await client.get('/api/upscalers/');
        setUpscalers(res.data.upscalers || []);
        if (res.data.upscalers?.length > 0) setSelectedUpscaler(res.data.upscalers[0]);
      } catch (err) {
        console.error('Failed to fetch upscalers:', err);
      }
    };
    fetchUpscalers();
  }, []);

  // Handle form submission
  const handleSubmit = async () => {
    if (!maskData || !prompt.trim() || !baseImage) {
      alert('Please create a mask, enter a prompt, and ensure the image is loaded');
      return;
    }

    setIsGenerating(true);
    try {
      // Convert mask and base image to File objects
      const maskBlob = await (await fetch(maskData)).blob();
      const maskFile = new File([maskBlob], 'mask.png', { type: 'image/png' });

      const imgBlob = await (await fetch(baseImage.src)).blob();
      const imageFile = new File([imgBlob], 'image.png', { type: imgBlob.type });

      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('mask', maskFile);
      formData.append('prompt', prompt);
      formData.append('model', selectedModel);
      formData.append('strength', strength.toString());
      formData.append('guidance_scale', guidanceScale.toString());
      formData.append('steps', steps.toString());
      formData.append('passes', passes.toString());
      if (seed.trim() !== '') formData.append('seed', seed);
      if (selectedFinishModel !== 'None') formData.append('finish_model', selectedFinishModel);
      if (negativePrompt.trim() !== '') formData.append('negative_prompt', negativePrompt);
      if (enableUpscaler && selectedUpscaler) formData.append('upscaler_model', selectedUpscaler);

      const sessionId = localStorage.getItem('session_id');
      const response = await client.post('/jobs', formData, {
        headers: sessionId ? { 'X-Session-ID': sessionId } : {},
      });

      console.log('Job created:', response.data);
      navigate(`/job/${response.data.job_id}`);
    } catch (err) {
      console.error('Error creating job:', err);
      alert('Error creating job');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!baseImage) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'dark:bg-gray-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>Loading image...</p>
        </div>
      </div>
    );
  }

  if (!baseImage) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${darkMode ? 'dark:bg-gray-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>Loading image...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'dark:bg-gray-900 dark:text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-500 to-purple-600 dark:from-blue-400 dark:to-purple-500 bg-clip-text text-transparent">
              AI Image Editor
            </h1>
            <p className={`mt-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              Edit and transform your image using advanced AI models
            </p>
          </div>
          <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
            darkMode 
              ? 'bg-gray-800 text-blue-400 border border-gray-700' 
              : 'bg-blue-50 text-blue-700 border border-blue-100'
          }`}>
            Image loaded successfully
          </div>
        </div>

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Masking Tool Section */}
          <div className={`rounded-2xl overflow-hidden transition-all duration-300 ${
            darkMode 
              ? 'bg-gray-800/80 backdrop-blur-sm shadow-2xl border border-gray-700' 
              : 'bg-white/90 backdrop-blur-sm shadow-xl border border-gray-100'
          }`}>
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                  darkMode 
                    ? 'bg-blue-900/30 text-blue-400' 
                    : 'bg-blue-100 text-blue-600'
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold">Masking Tool</h2>
              </div>
              <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Draw on the image to select the area you want to modify
              </p>
              <MaskingCanvas 
                baseImage={baseImage} 
                onMaskExport={setMaskData}
                darkMode={darkMode}
              />
            </div>
          </div>

          {/* Controls Section */}
          <div className="space-y-6">
            {/* Prompt Input */}
            <div className={`rounded-2xl p-6 transition-all duration-300 ${
              darkMode 
                ? 'bg-gray-800/80 backdrop-blur-sm shadow-2xl border border-gray-700' 
                : 'bg-white/90 backdrop-blur-sm shadow-xl border border-gray-100'
            }`}>
              <div className="flex items-center mb-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                  darkMode 
                    ? 'bg-green-900/30 text-green-400' 
                    : 'bg-green-100 text-green-600'
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold">Prompt</h2>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what you want to generate in the masked area..."
                className={`w-full h-32 p-3 rounded-lg border resize-none focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all duration-200 ${
                  darkMode 
                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                }`}
              />
              <p className={`text-xs mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Be specific about colors, textures, styles, and details for best results
              </p>
              <div className="mt-4">
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Negative Prompt (optional)
                </label>
                <input
                  type="text"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="Things to avoid (e.g., blurry, low quality, text, watermark)"
                  className={`w-full p-3 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all duration-200 ${
                    darkMode 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                />
              </div>
            </div>

            {/* Model Selection */}
            <div className={`rounded-2xl p-6 transition-all duration-300 ${
              darkMode 
                ? 'bg-gray-800/80 backdrop-blur-sm shadow-2xl border border-gray-700' 
                : 'bg-white/90 backdrop-blur-sm shadow-xl border border-gray-100'
            }`}>
              <div className="flex items-center mb-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                  darkMode 
                    ? 'bg-purple-900/30 text-purple-400' 
                    : 'bg-purple-100 text-purple-600'
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold">Model</h2>
              </div>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className={`w-full p-3 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all duration-200 ${
                  darkMode 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300 text-gray-900'
                }`}
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Advanced Settings */}
            <div className={`rounded-2xl transition-all duration-300 ${
              darkMode 
                ? 'bg-gray-800/80 backdrop-blur-sm shadow-2xl border border-gray-700' 
                : 'bg-white/90 backdrop-blur-sm shadow-xl border border-gray-100'
            }`}>
              <button
                className={`w-full flex items-center justify-between p-6 text-left ${
                  darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-50'
                } transition-colors duration-200`}
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <div className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                    darkMode 
                      ? 'bg-orange-900/30 text-orange-400' 
                      : 'bg-orange-100 text-orange-600'
                  }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <h2 className="text-xl font-semibold">Advanced Settings</h2>
                </div>
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  className={`h-5 w-5 transition-transform duration-300 ${showAdvanced ? 'transform rotate-180' : ''} ${
                    darkMode ? 'text-gray-400' : 'text-gray-500'
                  }`} 
                  fill="none" 
                  viewBox="0 0 24 24" 
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showAdvanced && (
                <div className={`p-6 pt-0 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Strength: {strength.toFixed(2)}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={strength}
                        onChange={(e) => setStrength(parseFloat(e.target.value))}
                        className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
                          darkMode 
                            ? 'bg-gray-700 slider-dark' 
                            : 'bg-gray-200 slider-light'
                        }`}
                      />
                      <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        Higher values = more changes to the masked area
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Guidance Scale: {guidanceScale.toFixed(1)}
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        step="0.1"
                        value={guidanceScale}
                        onChange={(e) => setGuidanceScale(parseFloat(e.target.value))}
                        className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
                          darkMode 
                            ? 'bg-gray-700 slider-dark' 
                            : 'bg-gray-200 slider-light'
                        }`}
                      />
                      <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        Higher values = closer to prompt, may be less creative
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Steps: {steps}
                      </label>
                      <input
                        type="range"
                        min="10"
                        max="100"
                        step="1"
                        value={steps}
                        onChange={(e) => setSteps(parseInt(e.target.value))}
                        className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
                          darkMode 
                            ? 'bg-gray-700 slider-dark' 
                            : 'bg-gray-200 slider-light'
                        }`}
                      />
                      <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        More steps = higher quality, longer processing time
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Passes: {passes}
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="8"
                        step="1"
                        value={passes}
                        onChange={(e) => setPasses(parseInt(e.target.value))}
                        className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
                          darkMode 
                            ? 'bg-gray-700 slider-dark' 
                            : 'bg-gray-200 slider-light'
                        }`}
                      />
                      <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        More passes = better quality, longer processing time
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-dashed border-gray-600 dark:border-gray-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Seed (optional)
                        </label>
                        <input
                          type="text"
                          value={seed}
                          onChange={(e) => setSeed(e.target.value)}
                          placeholder="Leave empty for random seed"
                          className={`w-full p-2 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all duration-200 ${
                            darkMode 
                              ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                              : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                          }`}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Finish Model
                        </label>
                        <select
                          value={selectedFinishModel}
                          onChange={(e) => setSelectedFinishModel(e.target.value)}
                          className={`w-full p-2 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all duration-200 ${
                            darkMode 
                              ? 'bg-gray-700 border-gray-600 text-white' 
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                        >
                          {finishModels.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Upscaler Settings */}
                  <div className="mt-4 pt-4 border-t border-dashed border-gray-600 dark:border-gray-700">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Enable Upscaler
                        </label>
                        <button
                          type="button"
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            enableUpscaler 
                              ? darkMode 
                                ? 'bg-blue-600' 
                                : 'bg-blue-500' 
                              : darkMode 
                                ? 'bg-gray-600' 
                                : 'bg-gray-300'
                          }`}
                          onClick={() => setEnableUpscaler(!enableUpscaler)}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              enableUpscaler ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>

                      {enableUpscaler && upscalers.length > 0 && (
                        <>
                          <div className="mt-2">
                            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              Select Upscaler
                            </label>
                            <select
                              value={selectedUpscaler}
                              onChange={(e) => setSelectedUpscaler(e.target.value)}
                              className={`w-full p-2 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all duration-200 ${
                                darkMode 
                                  ? 'bg-gray-700 border-gray-600 text-white' 
                                  : 'bg-white border-gray-300 text-gray-900'
                              }`}
                            >
                              {upscalers.map((upscaler) => (
                                <option key={upscaler} value={upscaler}>
                                  {upscaler}
                                </option>
                              ))}
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Generate Button */}
            <button
              onClick={handleSubmit}
              disabled={!maskData || !prompt.trim() || isGenerating}
              className={`w-full flex items-center justify-center px-6 py-4 rounded-xl font-medium text-lg transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                !maskData || !prompt.trim() || isGenerating
                  ? darkMode 
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : darkMode 
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg' 
                    : 'bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white shadow-md'
              }`}
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                  Generating...
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  Generate Image
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditorPage;