import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import MaskingCanvas from '../components/MaskingCanvas';

interface LocationState {
  imageUrl: string;
}

const EditorPage = () => {
  const { state } = useLocation() as { state: LocationState };
  const navigate = useNavigate();
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [prompt, setPrompt] = useState('');
  const [maskData, setMaskData] = useState('');

  // Load image from uploaded file
  useEffect(() => {
    if (!state?.imageUrl) {
      navigate('/');
      return;
    }
    const img = new Image();
    img.src = state.imageUrl;
    img.onload = () => setBaseImage(img);
  }, [state, navigate]);

  const handleSubmit = async () => {
  if (!maskData || !prompt.trim()) {
    alert('Please create a mask and enter a prompt');
    return;
  }

  try {
    // Zamiana dataURL na Blob
    const blob = await (await fetch(maskData)).blob();
    const file = new File([blob], 'mask.png', { type: 'image/png' });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('session_id', "dummy-session-1"); // zakładam, że masz gdzieś sessionId

    const response = await fetch('/temp-mask/', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to upload mask');
    }

    const data = await response.json();
    console.log('Uploaded mask URL:', data.file_url);

    // Tutaj możesz wysłać prompt i file_url do dalszego przetwarzania
  } catch (err) {
    console.error(err);
    alert('Error uploading mask');
  }
};


  if (!baseImage) return <div>Loading image...</div>;

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Image Editor</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h2 className="text-xl mb-2">Masking Tool</h2>
          <MaskingCanvas 
            baseImage={baseImage} 
            onMaskExport={setMaskData} 
          />
        </div>

        <div className="space-y-4">
          <div>
            <h2 className="text-xl mb-2">Prompt</h2>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want to generate..."
              className="w-full h-32 p-2 border rounded"
            />
          </div>

          <button
            onClick={handleSubmit}
            className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditorPage;