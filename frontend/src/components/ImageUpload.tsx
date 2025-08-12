import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';

interface ImageUploadProps {
  onImageUpload: (file: File) => void;
}

const ImageUpload = ({ onImageUpload }: ImageUploadProps) => {
  const [preview, setPreview] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPEG/PNG)');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result as string);
      onImageUpload(file);
    };
    reader.readAsDataURL(file);
  }, [onImageUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // MAX SIZE 10MB
  });

  return (
    <div {...getRootProps()} className="dropzone">
      <input {...getInputProps()} />
      {preview ? (
        <img src={preview} alt="Preview" className="max-w-full max-h-80" />
      ) : (
        <p>{isDragActive ? 'Drop image here' : 'Drag & drop or click to select'}</p>
      )}
    </div>
  );
};

export default ImageUpload;