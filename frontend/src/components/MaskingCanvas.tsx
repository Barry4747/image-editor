import { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Image, Line, Rect } from 'react-konva';
import Konva from 'konva';

interface MaskingCanvasProps {
  baseImage: HTMLImageElement;
  onMaskExport: (maskDataUrl: string) => void;
}

type LineData = {
  points: { x: number; y: number }[];
  brushSize: number;
  color: string;
  closed?: boolean;
};

type Selection = {
  x: number;
  y: number;
  width: number;
  height: number;
} | null;

const MaskingCanvas = ({ baseImage, onMaskExport }: MaskingCanvasProps) => {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [lines, setLines] = useState<LineData[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(10);
  const [showMask, setShowMask] = useState(false);
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [drawingMode, setDrawingMode] = useState<'free' | 'lasso' | 'rectangle'>('free');
  const [selection, setSelection] = useState<Selection>(null);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Skalowanie obrazu z zachowaniem proporcji
  useEffect(() => {
    if (!baseImage || !containerRef.current) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = window.innerHeight * 0.7; // 70% wysokości okna

    const imgRatio = baseImage.naturalWidth / baseImage.naturalHeight;
    const containerRatio = containerWidth / containerHeight;

    let scaledWidth, scaledHeight;

    if (imgRatio > containerRatio) {
      // Obraz szerszy niż kontener - skalowanie do szerokości
      scaledWidth = containerWidth;
      scaledHeight = containerWidth / imgRatio;
    } else {
      // Obraz wyższy niż kontener - skalowanie do wysokości
      scaledHeight = containerHeight;
      scaledWidth = containerHeight * imgRatio;
    }

    setScale(scaledWidth / baseImage.naturalWidth);
    setCanvasSize({
      width: scaledWidth,
      height: scaledHeight
    });
  }, [baseImage]);

  const getRelativePointerPosition = (stage: Konva.Stage) => {
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    
    return {
      x: pos.x / scale,
      y: pos.y / scale
    };
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    if (!stage) return;

    const pos = getRelativePointerPosition(stage);
    if (!pos) return;

    if (drawingMode === 'free' || drawingMode === 'lasso') {
      setIsDrawing(true);
      setLines((prev) => [
        ...prev,
        {
          points: [pos],
          brushSize,
          color: tool === 'brush' ? 'black' : 'white',
          closed: drawingMode === 'lasso',
        },
      ]);
    } else if (drawingMode === 'rectangle') {
      setSelectionStart(pos);
      setSelection({
        x: pos.x,
        y: pos.y,
        width: 0,
        height: 0,
      });
      setIsDrawing(true);
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawing) return;
    const stage = e.target.getStage();
    if (!stage) return;

    const pos = getRelativePointerPosition(stage);
    if (!pos) return;

    if (drawingMode === 'free' || drawingMode === 'lasso') {
      const lastLine = lines[lines.length - 1];
      lastLine.points.push(pos);
      setLines([...lines.slice(0, -1), lastLine]);
    } else if (drawingMode === 'rectangle' && selectionStart) {
      const sx = selectionStart.x;
      const sy = selectionStart.y;
      setSelection({
        x: Math.min(sx, pos.x),
        y: Math.min(sy, pos.y),
        width: Math.abs(pos.x - sx),
        height: Math.abs(pos.y - sy),
      });
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;

    if (drawingMode === 'lasso') {
      const lastLine = lines[lines.length - 1];
      if (lastLine.points.length > 2) {
        lastLine.points.push(lastLine.points[0]);
        lastLine.closed = true;
        setLines([...lines.slice(0, -1), lastLine]);
      }
    } else if (drawingMode === 'rectangle' && selection) {
      const rectPoints = [
        { x: selection.x, y: selection.y },
        { x: selection.x + selection.width, y: selection.y },
        { x: selection.x + selection.width, y: selection.y + selection.height },
        { x: selection.x, y: selection.y + selection.height },
      ];

      setLines((prev) => [
        ...prev,
        {
          points: rectPoints,
          brushSize: 2,
          color: 'black',
          closed: true,
        },
      ]);
      setSelectionStart(null);
      setSelection(null);
    }
    setIsDrawing(false);
  };

  // Eksport maski
  useEffect(() => {
    if (!baseImage) return;

    // Utwórz tymczasowy canvas w oryginalnych wymiarach obrazu
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = baseImage.naturalWidth;
    tempCanvas.height = baseImage.naturalHeight;
    const ctx = tempCanvas.getContext('2d');
    
    if (!ctx) return;

    // Wypełnij białym tłem
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Narysuj wszystkie linie
    ctx.fillStyle = 'black';
    ctx.strokeStyle = 'black';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    lines.forEach(line => {
      if (line.points.length < 2) return;

      ctx.beginPath();
      ctx.moveTo(line.points[0].x, line.points[0].y);
      
      for (let i = 1; i < line.points.length; i++) {
        ctx.lineTo(line.points[i].x, line.points[i].y);
      }

      ctx.lineWidth = line.brushSize;
      ctx.strokeStyle = line.color === 'black' ? 'black' : 'white';
      
      if (line.closed) {
        ctx.closePath();
        ctx.fillStyle = 'black';
        ctx.fill();
      }
      
      ctx.stroke();
    });

    // Eksportuj jako data URL
    const dataUrl = tempCanvas.toDataURL('image/png');
    onMaskExport(dataUrl);
  }, [lines, baseImage, onMaskExport]);

  const resetAll = () => {
    setLines([]);
    setSelection(null);
    setSelectionStart(null);
    setIsDrawing(false);
    setTool('brush');
    setDrawingMode('free');
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-4 items-center flex-wrap">
        <label>
          Brush Size:
          <input
            type="range"
            min="1"
            max="50"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            disabled={drawingMode === 'rectangle'}
          />
          {brushSize}px
        </label>
        <button
          onClick={() => {
            setTool('brush');
            setDrawingMode('free');
          }}
          className={`px-3 py-1 rounded ${
            tool === 'brush' && drawingMode === 'free'
              ? 'bg-blue-400 text-white'
              : 'bg-gray-200'
          }`}
        >
          Brush
        </button>
        <button
          onClick={() => {
            setTool('eraser');
            setDrawingMode('free');
          }}
          className={`px-3 py-1 rounded ${
            tool === 'eraser' && drawingMode === 'free'
              ? 'bg-blue-400 text-white'
              : 'bg-gray-200'
          }`}
        >
          Eraser
        </button>
        <button
          onClick={() => {
            setDrawingMode('free');
            setTool('brush');
          }}
          className={`px-3 py-1 rounded ${
            drawingMode === 'free' ? 'bg-blue-400 text-white' : 'bg-gray-200'
          }`}
        >
          Free Draw
        </button>
        <button
          onClick={() => {
            setDrawingMode('lasso');
            setTool('brush');
          }}
          className={`px-3 py-1 rounded ${
            drawingMode === 'lasso' ? 'bg-blue-400 text-white' : 'bg-gray-200'
          }`}
        >
          Lasso Select
        </button>
        <button
          onClick={() => {
            setDrawingMode('rectangle');
            setTool('brush');
          }}
          className={`px-3 py-1 rounded ${
            drawingMode === 'rectangle' ? 'bg-blue-400 text-white' : 'bg-gray-200'
          }`}
        >
          Rect Select
        </button>
        <button
          onClick={() => setShowMask(!showMask)}
          className="px-3 py-1 rounded bg-gray-200"
        >
          {showMask ? 'Hide Mask' : 'Show Mask Preview'}
        </button>
        <button
          onClick={resetAll}
          className="px-3 py-1 rounded bg-red-500 text-white"
        >
          Reset
        </button>
      </div>

      {/* Kontener canvas */}
      <div
        ref={containerRef}
        className="border overflow-hidden"
        style={{ maxWidth: '100%' }}
      >
        <Stage
          ref={stageRef}
          width={canvasSize.width}
          height={canvasSize.height}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{
            cursor: drawingMode === 'lasso' ? 'crosshair' : 'default',
            display: 'block',
          }}
        >
          <Layer>
            <Image
              image={baseImage}
              width={baseImage.naturalWidth}
              height={baseImage.naturalHeight}
            />
          </Layer>
          <Layer>
            {lines.map((line, i) => (
              <Line
                key={i}
                points={line.points.flatMap((p) => [p.x, p.y])}
                stroke={line.color}
                strokeWidth={line.brushSize}
                lineCap="round"
                lineJoin="round"
                tension={0.5}
                closed={line.closed}
                fill={line.closed && showMask ? 'rgba(0,0,0,0.5)' : undefined}
              />
            ))}
            {drawingMode === 'rectangle' && selection && (
              <Rect
                x={selection.x}
                y={selection.y}
                width={selection.width}
                height={selection.height}
                stroke="blue"
                strokeWidth={2}
                dash={[10, 5]}
              />
            )}
          </Layer>
        </Stage>
      </div>
    </div>
  );
};

export default MaskingCanvas;