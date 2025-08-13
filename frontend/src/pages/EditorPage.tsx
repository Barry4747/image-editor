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
  if (!maskData || !prompt.trim() || !baseImage) {
    alert('Please create a mask, enter a prompt, and ensure image is loaded');
    return;
  }

  try {
    // Zamiana maski z dataURL na Blob
    const maskBlob = await (await fetch(maskData)).blob();
    const maskFile = new File([maskBlob], 'mask.png', { type: 'image/png' });

    // Zamiana baseImage.src na Blob
    const imgResponse = await fetch(baseImage.src);
    const imgBlob = await imgResponse.blob();
    const imageFile = new File([imgBlob], 'image.png', { type: imgBlob.type });

    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('mask', maskFile);
    formData.append('prompt', prompt);

    const response = await fetch('/jobs', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error('Failed to create job');
    }

    const data = await response.json();
    console.log('Job created:', data);

    alert(`Job created! ID: ${data.job_id}`);
  } catch (err) {
    console.error(err);
    alert('Error creating job');
  }
};

  if (!baseImage) return <div>Loading image...</div>;

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold">Image Editor</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-1 gap-8">
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