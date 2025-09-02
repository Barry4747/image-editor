import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

interface ProgressEvent {
  type: string;
  event: string;
  job_id: number;
  iteration?: number;
  preview_url?: string;
  progress?: number;
  [key: string]: any;
}

interface JobData {
  prompt: string;
  negative_prompt?: string;
  model: string;
  strength?: number;
  guidance_scale?: number;
  steps?: number;
  passes?: number;
  seed?: string;
  finish_model?: string;
  upscale_model?: string;
  scale?: number;
  image?: string;
  mask?: string;
}

interface JobProgressPageProps {
  darkMode: boolean;
}

export default function JobProgressPage({ darkMode }: JobProgressPageProps) {
  const { jobId } = useParams();
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<'created' | 'processing' | 'upscaling' | 'done'>('created');
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [jobData, setJobData] = useState<JobData | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [showImage, setShowImage] = useState(false);
  const [showMask, setShowMask] = useState(false);

  useEffect(() => {
    let sessionId = localStorage.getItem('sessionId') || 'dummy-session-id';
    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;

    const connect = () => {
      try {
        ws = new WebSocket(`ws://localhost:8000/ws/progress/${sessionId}/`);
        
        ws.onopen = () => {
          console.log('WebSocket connected');
          setError(null);
        };

        ws.onmessage = (e) => {
          const data: ProgressEvent = JSON.parse(e.data);
          if (data.job_id !== Number(jobId)) return;

          switch (data.event) {
            case 'created':
              setStatus('created');
              setProgress(0);
              break;

            case 'progress':
              setStatus('processing');
              if (data.progress !== undefined) setProgress(data.progress * 100);
              if (data.preview_url) setOutputUrl("http://localhost:8000" + data.preview_url);
              break;
            
            case 'upscaling':
              setStatus('upscaling');
              if (data.progress !== undefined) setProgress(data.progress * 100);
              if (data.preview_url) setOutputUrl("http://localhost:8000" + data.preview_url);
              break;
              
            case 'done':
              setStatus('done');
              setProgress(100);
              if (data.preview_url) setOutputUrl("http://localhost:8000" + data.preview_url);
              console.log(data)
              // Extract job data from the response
              if (data.job_data) {
                const jobInfo: JobData = {
                  prompt: data.job_data.prompt || '',
                  model: data.job_data.model || 'default',
                  scale: data.job_data.scale || 4,
                };
                
                // Add optional parameters if they exist and are not None
                if (data.job_data.negative_prompt) jobInfo.negative_prompt = data.job_data.negative_prompt;
                if (data.job_data.strength !== undefined) jobInfo.strength = data.job_data.strength;
                if (data.job_data.guidance_scale !== undefined) jobInfo.guidance_scale = data.job_data.guidance_scale;
                if (data.job_data.steps !== undefined) jobInfo.steps = data.job_data.steps;
                if (data.job_data.passes !== undefined) jobInfo.passes = data.job_data.passes;
                if (data.job_data.seed) jobInfo.seed = data.job_data.seed;
                if (data.job_data.finish_model && data.job_data.finish_model !== 'None') jobInfo.finish_model = data.job_data.finish_model;
                if (data.job_data.upscale_model) jobInfo.upscale_model = data.job_data.upscale_model;
                
                // Add image and mask URLs if they exist
                if (data.job_data.image) jobInfo.image = "http://localhost:8000" + data.job_data.image;
                if (data.job_data.mask) jobInfo.mask = "http://localhost:8000" + data.job_data.mask;
                
                setJobData(jobInfo);
              }
              break;

            default:
              console.warn('Unknown event type:', data.event);
          }
        };

        ws.onclose = (event) => {
          console.log('WebSocket closed:', event);
          
          // Only attempt to reconnect if it wasn't a clean close
          if (event.code !== 1000 && retryCount < 5) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff
            setRetryCount(prev => prev + 1);
            
            reconnectTimer = setTimeout(() => {
              console.log(`Reconnecting WebSocket (attempt ${retryCount + 1})...`);
              connect();
            }, delay);
          }
        };

        ws.onerror = (err) => {
          console.error('WebSocket error:', err);
          setError('Connection error. Retrying...');
        };
      } catch (err) {
        console.error('Failed to create WebSocket:', err);
        setError('Failed to establish connection');
      }
    };

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [jobId, retryCount]);

  const getStatusColor = () => {
    switch (status) {
      case 'created':
        return darkMode ? 'text-blue-400' : 'text-blue-600';
      case 'processing':
        return darkMode ? 'text-yellow-400' : 'text-yellow-600';
      case 'upscaling':
        return darkMode ? 'text-purple-400' : 'text-purple-600';
      case 'done':
        return darkMode ? 'text-green-400' : 'text-green-600';
      default:
        return darkMode ? 'text-gray-400' : 'text-gray-600';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'created':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        );
      case 'processing':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        );
      case 'upscaling':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
          </svg>
        );
      case 'done':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      default:
        return null;
    }
  };

  const renderParameter = (label: string, value: string | number | undefined, unit: string = '') => {
    if (value === undefined || value === null) return null;
    return (
      <div className={`flex justify-between py-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>{label}</span>
        <span className="font-medium">{value}{unit}</span>
      </div>
    );
  };

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'dark:bg-gray-900 dark:text-white' : 'bg-gray-50 text-gray-900'}`}>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="text-center mb-12">
          <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium mb-4 ${
            darkMode 
              ? 'bg-gray-800 text-blue-400 border border-gray-700' 
              : 'bg-blue-50 text-blue-700 border border-blue-100'
          }`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Job #{jobId}
          </div>
          
          <h1 className="text-3xl md:text-4xl font-bold mb-4 bg-gradient-to-r from-blue-500 to-purple-600 dark:from-blue-400 dark:to-purple-500 bg-clip-text text-transparent">
            Image Generation Progress
          </h1>
          
          <p className={`text-lg ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Tracking the progress of your AI image generation job
          </p>
        </div>

        {/* Main Content */}
        <div className={`rounded-2xl overflow-hidden transition-all duration-300 ${
          darkMode 
            ? 'bg-gray-800/80 backdrop-blur-sm shadow-2xl border border-gray-700' 
            : 'bg-white/90 backdrop-blur-sm shadow-xl border border-gray-100'
        }`}>
          <div className="p-8">
            {/* Status Section */}
            <div className="mb-8">
              <div className="flex items-center mb-6">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${
                  darkMode 
                    ? 'bg-blue-900/30 text-blue-400' 
                    : 'bg-blue-100 text-blue-600'
                }`}>
                  {getStatusIcon()}
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold">Status</h2>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Current state of your generation job
                  </p>
                </div>
                
                {status === 'done' && jobData && (
                  <button
                    onClick={() => setShowInfo(!showInfo)}
                    className={`p-2 rounded-lg transition-colors duration-200 ${
                      darkMode 
                        ? 'hover:bg-gray-700 text-blue-400' 
                        : 'hover:bg-gray-100 text-blue-600'
                    }`}
                    title="View generation parameters"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                )}
              </div>
              
              <div className={`p-6 rounded-xl border transition-colors duration-200 ${
                darkMode 
                  ? 'border-gray-700 bg-gray-800/50' 
                  : 'border-gray-200 bg-gray-50'
              }`}>
                <div className="flex items-center justify-between mb-4">
                  <span className={`text-lg font-medium ${getStatusColor()}`}>
                    {status === 'created' && 'Job Created'}
                    {status === 'processing' && 'Processing'}
                    {status === 'upscaling' && 'Upscaling'}
                    {status === 'done' && 'Completed'}
                  </span>
                  
                  <div className={`text-sm px-3 py-1 rounded-full ${
                    darkMode 
                      ? status === 'done' 
                        ? 'bg-green-900/30 text-green-400' 
                        : status === 'upscaling'
                          ? 'bg-purple-900/30 text-purple-400'
                          : 'bg-yellow-900/30 text-yellow-400'
                      : status === 'done' 
                        ? 'bg-green-100 text-green-700' 
                        : status === 'upscaling'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </div>
                </div>

                {(status === 'processing' || status === 'upscaling') && (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
                        Progress
                      </span>
                      <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
                        {Math.round(progress)}%
                      </span>
                    </div>
                    <div className={`h-3 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                      <div
                        className={`h-full transition-all duration-300 ease-out ${
                          status === 'processing' 
                            ? 'bg-gradient-to-r from-blue-500 to-purple-500' 
                            : 'bg-gradient-to-r from-purple-500 to-pink-500'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {status === 'done' && (
                  <div className="flex items-center p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Image generation completed successfully!
                  </div>
                )}
              </div>
            </div>

            {/* Preview Section */}
            {outputUrl && (
              <div className="mb-8">
                <div className="flex items-center mb-6">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${
                    darkMode 
                      ? 'bg-green-900/30 text-green-400' 
                      : 'bg-green-100 text-green-600'
                  }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold">Preview</h2>
                    <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Current output from the generation process
                    </p>
                  </div>
                  
                  {status === 'done' && jobData && (
                    <div className="flex space-x-2">
                      {jobData.image && (
                        <button
                          onClick={() => setShowImage(!showImage)}
                          className={`px-3 py-1 rounded-lg text-sm transition-colors duration-200 ${
                            darkMode 
                              ? showImage ? 'bg-blue-900/50 text-blue-400' : 'hover:bg-gray-700 text-gray-300' 
                              : showImage ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'
                          }`}
                        >
                          Base Image
                        </button>
                      )}
                      {jobData.mask && (
                        <button
                          onClick={() => setShowMask(!showMask)}
                          className={`px-3 py-1 rounded-lg text-sm transition-colors duration-200 ${
                            darkMode 
                              ? showMask ? 'bg-blue-900/50 text-blue-400' : 'hover:bg-gray-700 text-gray-300' 
                              : showMask ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'
                          }`}
                        >
                          Mask
                        </button>
                      )}
                    </div>
                  )}
                </div>
                
                <div className={`rounded-xl overflow-hidden border transition-colors duration-200 relative ${
                  darkMode ? 'border-gray-700' : 'border-gray-200'
                }`}>
                  <img
                    src={outputUrl}
                    alt="Generation preview"
                    className="w-full h-auto max-h-96 object-contain bg-gray-100 dark:bg-gray-800"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="${darkMode ? '%231f2937' : '%23f3f4f6'}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="24" fill="${darkMode ? '%239ca3af' : '%236b7280'}">Image Preview</text></svg>`;
                    }}
                  />
                </div>
                
                {/* Additional images */}
                {showImage && jobData?.image && (
                  <div className="mt-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <h3 className="font-medium mb-2">Base Image</h3>
                    <img 
                      src={jobData.image} 
                      alt="Base image" 
                      className="w-full h-auto max-h-64 object-contain rounded border border-gray-200 dark:border-gray-700"
                    />
                  </div>
                )}
                
                {showMask && jobData?.mask && (
                  <div className="mt-4 p-4 border rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <h3 className="font-medium mb-2">Mask</h3>
                    <img 
                      src={jobData.mask} 
                      alt="Mask" 
                      className="w-full h-auto max-h-64 object-contain rounded border border-gray-200 dark:border-gray-700"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Info Panel - only when job is done */}
            {status === 'done' && jobData && showInfo && (
              <div className="mb-8">
                <div className={`p-6 rounded-xl border ${
                  darkMode 
                    ? 'border-gray-700 bg-gray-800/50' 
                    : 'border-gray-200 bg-gray-50'
                }`}>
                  <div className="flex items-center mb-4">
                    <h3 className="font-semibold text-lg">Generation Parameters</h3>
                    <button
                      onClick={() => setShowInfo(false)}
                      className="ml-auto p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  
                  <div className="space-y-1">
                    <div className={`flex justify-between py-2 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                      <span className={darkMode ? 'text-gray-300' : 'text-gray-600'}>Prompt</span>
                      <span className="font-medium">{jobData.prompt}</span>
                    </div>
                    
                    {renderParameter('Negative Prompt', jobData.negative_prompt)}
                    {renderParameter('Model', jobData.model)}
                    {renderParameter('Strength', jobData.strength)}
                    {renderParameter('Guidance Scale', jobData.guidance_scale)}
                    {renderParameter('Steps', jobData.steps)}
                    {renderParameter('Passes', jobData.passes)}
                    {renderParameter('Seed', jobData.seed)}
                    {renderParameter('Finish Model', jobData.finish_model)}
                    {renderParameter('Upscaler Model', jobData.upscale_model)}
                    {renderParameter('Scale', jobData.scale)}
                  </div>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="mb-8">
                <div className="flex items-center p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h3 className="font-medium">Connection Issue</h3>
                    <p className="text-sm mt-1">{error}</p>
                    {retryCount < 5 && (
                      <p className="text-sm mt-1">
                        Attempt {retryCount + 1} of 5 - reconnecting automatically...
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Instructions */}
            <div className={`p-6 rounded-xl border ${
              darkMode 
                ? 'border-gray-700 bg-gray-800/50' 
                : 'border-gray-200 bg-gray-50'
            }`}>
              <h3 className="font-semibold mb-2">What's happening?</h3>
              <ul className={`list-disc list-inside text-sm space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                <li><strong>Created:</strong> Your job has been received and queued for processing</li>
                <li><strong>Processing:</strong> AI is generating your image based on your prompt and mask</li>
                <li><strong>Upscaling:</strong> Enhancing the image quality and resolution</li>
                <li><strong>Completed:</strong> Your image is ready for download</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8">
          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Keep this page open to see real-time updates. The process may take several minutes.
          </p>
        </div>
      </div>
    </div>
  );
}