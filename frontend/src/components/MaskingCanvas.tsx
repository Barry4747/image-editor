import { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Image, Line, Rect } from 'react-konva';
import Konva from 'konva';

interface MaskingCanvasProps {
  baseImage: HTMLImageElement;
  onMaskExport: (maskDataUrl: string) => void;
}

type Line = {
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
  const maskStageRef = useRef<Konva.Stage>(null);

  const [lines, setLines] = useState<Line[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(10);
  const [showMask, setShowMask] = useState(false);
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');

  // Tryby rysowania: 'free', 'lasso', 'rectangle'
  const [drawingMode, setDrawingMode] = useState<'free' | 'lasso' | 'rectangle'>('free');

  // Prostokątne zaznaczenie
  const [selection, setSelection] = useState<Selection>(null);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage();
    const point = stage?.getPointerPosition();
    if (!point) return;

    if (drawingMode === 'free' || drawingMode === 'lasso') {
      setIsDrawing(true);
      setLines((prev) => [
        ...prev,
        {
          points: [point],
          brushSize,
          color: tool === 'brush' ? 'black' : 'white',
          closed: drawingMode === 'lasso',
        },
      ]);
    } else if (drawingMode === 'rectangle') {
    setSelectionStart(point);
    setSelection({ x: point.x, y: point.y, width: 0, height: 0 });
    setIsDrawing(true); 
    }
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawing) return;
    const stage = e.target.getStage();
    const point = stage?.getPointerPosition();
    if (!point) return;

    if (drawingMode === 'free' || drawingMode === 'lasso') {
      const lastLine = lines[lines.length - 1];
      lastLine.points.push(point);
      setLines([...lines.slice(0, -1), lastLine]);
    } else if (drawingMode === 'rectangle' && selectionStart) {
      const sx = selectionStart.x;
      const sy = selectionStart.y;
      setSelection({
        x: Math.min(sx, point.x),
        y: Math.min(sy, point.y),
        width: Math.abs(point.x - sx),
        height: Math.abs(point.y - sy),
      });
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;

    if (drawingMode === 'lasso') {
      // Zamykamy linię lasso, dodając na koniec pierwszy punkt
      const lastLine = lines[lines.length - 1];
      if (lastLine.points.length > 2) {
        lastLine.points.push(lastLine.points[0]);
        lastLine.closed = true;
        setLines([...lines.slice(0, -1), lastLine]);
      }
    } else if (drawingMode === 'rectangle' && selection) {
      // Po zakończeniu prostokątnego zaznaczenia dodaj zamkniętą linię (prostokąt)
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

  useEffect(() => {
    if (!maskStageRef.current) return;
    const uri = maskStageRef.current.toDataURL({ mimeType: 'image/png' });
    onMaskExport(uri);
  }, [lines, brushSize, baseImage, onMaskExport]);

  // Reset wszystkiego
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
          className={`px-3 py-1 rounded ${tool === 'brush' && drawingMode === 'free' ? 'bg-blue-400 text-white' : 'bg-gray-200'}`}
        >
          Brush
        </button>

        <button
          onClick={() => {
            setTool('eraser');
            setDrawingMode('free');
          }}
          className={`px-3 py-1 rounded ${tool === 'eraser' && drawingMode === 'free' ? 'bg-blue-400 text-white' : 'bg-gray-200'}`}
        >
          Eraser
        </button>

        <button
          onClick={() => {
            setDrawingMode('free');
            setTool('brush');
            setSelection(null);
            setSelectionStart(null);
          }}
          className={`px-3 py-1 rounded ${drawingMode === 'free' ? 'bg-blue-400 text-white' : 'bg-gray-200'}`}
        >
          Free Draw
        </button>

        <button
          onClick={() => {
            setDrawingMode('lasso');
            setTool('brush');
            setSelection(null);
            setSelectionStart(null);
          }}
          className={`px-3 py-1 rounded ${drawingMode === 'lasso' ? 'bg-blue-400 text-white' : 'bg-gray-200'}`}
        >
          Lasso Select
        </button>

        <button
          onClick={() => {
            setDrawingMode('rectangle');
            setTool('brush');
            setSelection(null);
            setSelectionStart(null);
          }}
          className={`px-3 py-1 rounded ${drawingMode === 'rectangle' ? 'bg-blue-400 text-white' : 'bg-gray-200'}`}
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

      <Stage
        ref={stageRef}
        width={baseImage.width}
        height={baseImage.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="border"
        style={{ cursor: drawingMode === 'lasso' ? 'crosshair' : 'default' }}
      >
        <Layer>
          <Image image={baseImage} />
        </Layer>

        <Layer>
          {/* Prostokątne zaznaczenie w trakcie */}
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

          {/* Wszystkie linie (pędzel, gumka i zaznaczenia) */}
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
              fill={line.closed ? (showMask ? 'rgba(0,0,0,0.5)' : undefined) : undefined}
              opacity={showMask ? 1 : line.color === 'white' ? 1 : 0.7}
            />
          ))}
        </Layer>
      </Stage>

      {/* Ukryty canvas do eksportu maski */}
      <div style={{ display: 'none' }}>
        <Stage ref={maskStageRef} width={baseImage.width} height={baseImage.height}>
          <Layer>
            <Rect width={baseImage.width} height={baseImage.height} fill="white" />
            {lines.map((line, i) => (
              <Line
                key={i}
                points={line.points.flatMap((p) => [p.x, p.y])}
                stroke={line.color === 'black' ? 'black' : 'white'}
                strokeWidth={line.brushSize}
                lineCap="round"
                lineJoin="round"
                tension={0.5}
                closed={line.closed}
                fill={line.closed ? 'black' : undefined}
                opacity={1}
              />
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
};

export default MaskingCanvas;
