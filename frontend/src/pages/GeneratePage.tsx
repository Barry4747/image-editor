import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import client from "../api/axiosClient";

interface UploadPageProps {
  darkMode: boolean;
}

const TextToImagePage: React.FC<UploadPageProps> = ({ darkMode }) => {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Model selection
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');

  // Upscaler settings
  const [upscalers, setUpscalers] = useState<string[]>([]);
  const [selectedUpscaler, setSelectedUpscaler] = useState<string>('');
  const [enableUpscaler, setEnableUpscaler] = useState<boolean>(true);

  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [guidanceScale, setGuidanceScale] = useState(9.5);
  const [steps, setSteps] = useState(40);
  const [seed, setSeed] = useState<string>('');
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(512);

  // Fetch models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/t2i-models/');
        if (!res.ok) throw new Error('Failed to fetch models');
        const data = await res.json();
        setModels(data.models || []);
        if (data.models?.length > 0) setSelectedModel(data.models[0]);
      } catch (err) {
        console.error('Failed to fetch models:', err);
        // Fallback models
        const defaultModels = [
          'stable-diffusion-v1-5',
          'stable-diffusion-xl',
          'dreamshaper',
          'realistic-vision',
          'deliberate',
        ];
        setModels(defaultModels);
        setSelectedModel(defaultModels[0]);
      }
    };
    fetchModels();
  }, []);

  // Fetch upscalers
  useEffect(() => {
    const fetchUpscalers = async () => {
      try {
        const res = await fetch('/api/upscalers/');
        if (!res.ok) throw new Error('Failed to fetch upscalers');
        const data = await res.json();
        setUpscalers(data.upscalers || []);
        if (data.upscalers?.length > 0) setSelectedUpscaler(data.upscalers[0]);
      } catch (err) {
        console.error('Failed to fetch upscalers:', err);
      }
    };
    fetchUpscalers();
  }, []);

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      alert('Please enter a prompt');
      return;
    }

    setIsGenerating(true);
    try {
      const formData = new FormData();
      formData.append('prompt', prompt);
      formData.append('model', selectedModel);

      if (guidanceScale) formData.append('guidance_scale', guidanceScale.toString());
      if (steps) formData.append('steps', steps.toString());
      if (seed.trim()) formData.append('seed', seed);
      if (width) formData.append('width', width.toString());
      if (height) formData.append('height', height.toString());
      if (negativePrompt.trim()) formData.append('negative_prompt', negativePrompt);

      // Add upscaler and scale if enabled
      if (enableUpscaler && selectedUpscaler) {
        formData.append('upscaler_model', selectedUpscaler);
      }
      
      const sessionId = localStorage.getItem("session_id")
      try {
        const response = await client.post("/jobs", formData, {
          headers: sessionId ? { "X-Session-ID": sessionId } : {},
        });

        const data = response.data;
        navigate(`/job/${data.job_id}`);
      } catch (err) {
        console.error("Failed to create job:", err);
      }

    } catch (err) {
      console.error(err);
      alert('Error creating job');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit();
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'dark:bg-gray-900 dark:text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-500 to-purple-600 dark:from-blue-400 dark:to-purple-500 bg-clip-text text-transparent">
            AI Image Generator
          </h1>
          <p className={`text-lg ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Create stunning images from text descriptions using artificial intelligence
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Controls Section */}
          <div className="space-y-6">
            {/* Prompt */}
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
                <h2 className="text-xl font-semibold">Text Prompt</h2>
              </div>
              <form onSubmit={handleFormSubmit}>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the image you want to generate... (e.g., 'A futuristic city at sunset with flying cars, cyberpunk style, highly detailed, 8k resolution')"
                  className={`w-full h-32 p-3 rounded-lg border resize-none focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all duration-200 ${
                    darkMode 
                      ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                  required
                />
                <p className={`text-xs mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Be specific about subjects, styles, colors, lighting, and details for best results
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
              </form>
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
                {models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>

            {/* Image Dimensions */}
            <div className={`rounded-2xl p-6 transition-all duration-300 ${
              darkMode 
                ? 'bg-gray-800/80 backdrop-blur-sm shadow-2xl border border-gray-700' 
                : 'bg-white/90 backdrop-blur-sm shadow-xl border border-gray-100'
            }`}>
              <div className="flex items-center mb-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                  darkMode 
                    ? 'bg-blue-900/30 text-blue-400' 
                    : 'bg-blue-100 text-blue-600'
                }`}>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold">Image Size</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Width: {width}px
                  </label>
                  <input
                    type="range"
                    min="256"
                    max="1024"
                    step="64"
                    value={width}
                    onChange={(e) => setWidth(parseInt(e.target.value))}
                    className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
                      darkMode ? 'bg-gray-700 slider-dark' : 'bg-gray-200 slider-light'
                    }`}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Height: {height}px
                  </label>
                  <input
                    type="range"
                    min="256"
                    max="1024"
                    step="64"
                    value={height}
                    onChange={(e) => setHeight(parseInt(e.target.value))}
                    className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${
                      darkMode ? 'bg-gray-700 slider-dark' : 'bg-gray-200 slider-light'
                    }`}
                  />
                </div>
              </div>
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
                  <div className="space-y-4">
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
                          darkMode ? 'bg-gray-700 slider-dark' : 'bg-gray-200 slider-light'
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
                          darkMode ? 'bg-gray-700 slider-dark' : 'bg-gray-200 slider-light'
                        }`}
                      />
                      <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        More steps = higher quality, longer processing time
                      </p>
                    </div>

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

                    {/* Upscaler Settings */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          Enable Upscaler
                        </label>
                        <button
                          type="button"
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            enableUpscaler 
                              ? darkMode ? 'bg-blue-600' : 'bg-blue-500' 
                              : darkMode ? 'bg-gray-600' : 'bg-gray-300'
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
                        <div className="mt-3 space-y-3">
                          <div>
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
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Generate Button */}
            <button
              onClick={handleSubmit}
              disabled={!prompt.trim() || isGenerating}
              className={`w-full flex items-center justify-center px-6 py-4 rounded-xl font-medium text-lg transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                !prompt.trim() || isGenerating
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

          {/* Tips */}
          <div className={`mt-6 rounded-2xl p-6 transition-all duration-300 ${
            darkMode 
              ? 'bg-gray-800/80 backdrop-blur-sm shadow-2xl border border-gray-700' 
              : 'bg-white/90 backdrop-blur-sm shadow-xl border border-gray-100'
          }`}>
            <h3 className="text-lg font-semibold mb-3 flex items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 mr-2 ${darkMode ? 'text-blue-400' : 'text-blue-600'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Tips for Better Results
            </h3>
            <ul className={`space-y-2 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
              <li className="flex items-start">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full mr-2 mt-0.5 text-xs ${
                  darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-600'
                }`}>1</span>
                Be specific about subjects, styles, and details
              </li>
              <li className="flex items-start">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full mr-2 mt-0.5 text-xs ${
                  darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-600'
                }`}>2</span>
                Include artistic styles (e.g., "oil painting", "cyberpunk", "watercolor")
              </li>
              <li className="flex items-start">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full mr-2 mt-0.5 text-xs ${
                  darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-600'
                }`}>3</span>
                Specify lighting conditions (e.g., "golden hour", "neon lighting")
              </li>
              <li className="flex items-start">
                <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full mr-2 mt-0.5 text-xs ${
                  darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-600'
                }`}>4</span>
                Use negative prompts to exclude unwanted elements
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TextToImagePage;