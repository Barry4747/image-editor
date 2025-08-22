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

export default function JobProgressPage() {
  const { jobId } = useParams();
  const [progress, setProgress] = useState<number>(0);
  const [status, setStatus] = useState<'created' | 'processing' | 'done'>('created');
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  useEffect(() => {
    let sessionId = localStorage.getItem('sessionId') || 'dummy-session-id';
    const ws = new WebSocket(`ws://localhost:8000/ws/progress/${sessionId}/`);

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
          if (data.progress !== undefined) setProgress(data.progress*100);
          if (data.preview_url) setOutputUrl("http://localhost:8000" + data.preview_url);
          break;

        case 'done':
          setStatus('done');
          setProgress(100);
          if (data.preview_url) setOutputUrl("http://localhost:8000" + data.preview_url);
          break;

        default:
          console.warn('Unknown event type:', data.event);
      }
    };

    ws.onclose = () => console.log('WebSocket closed');
    ws.onerror = (err) => console.error('WebSocket error:', err);

    return () => ws.close();
  }, [jobId]);

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Job #{jobId}</h1>
      <p>Status: {status}</p>

      {status === 'processing' && (
        <div style={{ margin: '1rem 0' }}>
          <div style={{ height: '20px', background: '#eee', borderRadius: '10px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: '#4caf50',
                transition: 'width 0.3s ease-in-out'
              }}
            />
          </div>
          <p style={{ textAlign: 'right', marginTop: '0.5rem' }}>{progress}%</p>
        </div>
      )}

      {outputUrl && (
        <div style={{ marginTop: '1rem' }}>
          <h2>Preview:</h2>
          <img
            src={outputUrl}
            alt="Preview"
            style={{ maxWidth: '100%', border: '1px solid #ccc', borderRadius: '8px' }}
          />
        </div>
      )}
    </div>
  );
}
