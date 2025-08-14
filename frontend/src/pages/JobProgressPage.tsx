import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export default function JobProgressPage() {
  const { jobId } = useParams();
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState('created');
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  useEffect(() => {
    var sessionId = localStorage.getItem('sessionId');
    
    if (!sessionId) {
      sessionId = 'dummy-session-id';
    } 

    const ws = new WebSocket(`ws://localhost:8000/ws/progress/${sessionId}/`);

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      console.log('WS event:', data);

      if (data.job_id !== Number(jobId)) return;

      if (data.event === 'progress') {
        setProgress(data.progress);
        setStatus('processing');
      } else if (data.event === 'done') {
        setStatus('done');
        console.log('Output URL:', data.output_url);
        setOutputUrl("http://localhost:8000" + data.output_url);
      } else if (data.event === 'created') {
        setStatus('created');
      }
    };

    return () => ws.close();
  }, [jobId]);

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Job #{jobId}</h1>
      <p>Status: {status}</p>
      {status === 'processing' && (
        <p>Progress: {progress !== null ? `${progress}%` : '...'} </p>
      )}
      {status === 'done' && outputUrl && (
        <div>
          <h2>Output:</h2>
          <img src={outputUrl} alt="Result" style={{ maxWidth: '100%' }} />
        </div>
      )}
    </div>
  );
}
