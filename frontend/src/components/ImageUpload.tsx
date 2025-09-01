
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

interface ImageUploadProps {
  onImageUpload: (file: File) => void;
  darkMode?: boolean;
  isDragging?: boolean;
  setIsDragging?: (dragging: boolean) => void;
}

const ImageUpload = ({ onImageUpload, darkMode = false, isDragging = false, setIsDragging }: ImageUploadProps) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError(null);
    const file = acceptedFiles[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPEG, PNG, or WEBP)');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10MB limit');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result as string);
      onImageUpload(file);
    };
    reader.onerror = () => {
      setError('Error reading file');
    };
    reader.readAsDataURL(file);
  }, [onImageUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 
      'image/*': ['.jpeg', '.jpg', '.png', '.webp'] 
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    onDragEnter: () => setIsDragging ? setIsDragging(true) : null,
    onDragLeave: () => setIsDragging ? setIsDragging(false) : null,
    onDropAccepted: () => setIsDragging ? setIsDragging(false) : null,
    onDropRejected: () => setIsDragging ? setIsDragging(false) : null
  });

  return (
    <div className="space-y-4">
      <div 
        {...getRootProps()} 
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 cursor-pointer
          ${isDragActive 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 scale-[1.02]' 
            : darkMode 
              ? 'border-gray-600 hover:border-gray-500 hover:bg-gray-800/50' 
              : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
          }`}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center justify-center">
          <div className={`w-16 h-16 mb-4 rounded-full flex items-center justify-center ${
            darkMode 
              ? 'bg-gray-800 text-blue-400' 
              : 'bg-gray-100 text-blue-500'
          }`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 10h-4m-6-4v4m0 0v4m0-4h4m-4 0h4" />
            </svg>
          </div>
          
          {preview ? (
            <div className="relative w-full max-w-md mx-auto">
              <img 
                src={preview} 
                alt="Preview" 
                className="max-w-full h-auto rounded-lg shadow-lg"
              />
              <button
                type="button"
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreview(null);
                  // You might want to call onImageUpload with null here
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <p className={`text-lg font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                {isDragActive ? 'Drop your image here' : 'Drag & drop an image here'}
              </p>
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                or click to browse your files
              </p>
              <p className={`text-xs mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                Supports JPEG, PNG, WEBP (up to 10MB)
              </p>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {error}
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
