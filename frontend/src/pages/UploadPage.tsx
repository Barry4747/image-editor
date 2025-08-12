import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ImageUpload from '../components/ImageUpload';

const UploadPage = () => {
  const navigate = useNavigate();
  const [imageFile, setImageFile] = useState<File | null>(null);

  const handleImageUpload = (file: File) => {
    setImageFile(file);
    // Here you would typically upload to backend
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">AI Image Editor</h1>
      <ImageUpload onImageUpload={handleImageUpload} />
      
      {imageFile && (
        <button 
          onClick={() => navigate('/editor', { 
            state: { 
              imageUrl: URL.createObjectURL(imageFile) 
            } 
          })}
          className="mt-4 bg-blue-500 text-white px-4 py-2 rounded"
        >
          Proceed to Editor
        </button>
      )}
    </div>
  );
};

export default UploadPage;