import { useRef, useState, useEffect, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Rect } from "react-konva";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import { throttle } from "lodash";
import './styles/MaskingCanvas.css'

interface MaskingCanvasProps {
  baseImage: HTMLImageElement;
  onMaskExport: (maskDataUrl: string) => void;
  darkMode?: boolean;
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

interface AIMask {
  url: string;
  image: HTMLImageElement | null;
  alphaData?: Uint8ClampedArray;
  width?: number;
  height?: number;
}

const MaskingCanvas = ({ baseImage, onMaskExport, darkMode = false }: MaskingCanvasProps) => {
  const stageRef = useRef<KonvaStage>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [lines, setLines] = useState<LineData[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(10);
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [drawingMode, setDrawingMode] = useState<"free" | "lasso" | "rectangle">("free");
  const [selection, setSelection] = useState<Selection>(null);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  const [aiMasks, setAiMasks] = useState<AIMask[]>([]);
  const [hoveredMaskIndex, setHoveredMaskIndex] = useState<number | null>(null);
  const [selectedMaskIndices, setSelectedMaskIndices] = useState<number[]>([]);
  const [aiProcessing, setAiProcessing] = useState(false);

  // --- Handle container resize and image loading ---
  useEffect(() => {
    if (!baseImage) return;
    
    // Calculate the optimal canvas size based on container and image dimensions
    const updateCanvasSize = () => {
      if (!containerRef.current || !baseImage) return;
      
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight || 600;
      
      // Calculate aspect ratios
      const imageRatio = baseImage.naturalWidth / baseImage.naturalHeight;
      const containerRatio = containerWidth / containerHeight;
      
      let width, height;
      
      if (imageRatio > containerRatio) {
        // Image is wider than container
        width = Math.min(containerWidth, baseImage.naturalWidth);
        height = width / imageRatio;
      } else {
        // Image is taller than container
        height = Math.min(containerHeight, baseImage.naturalHeight);
        width = height * imageRatio;
      }
      
      // Ensure minimum dimensions
      width = Math.max(width, 200);
      height = Math.max(height, 150);
      
      setCanvasSize({ width, height });
    };
    
    // Initial update
    updateCanvasSize();
    
    // Update on window resize
    const handleResize = throttle(updateCanvasSize, 100);
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [baseImage]);

  // --- Preprocess mask ---
  const preprocessMask = useCallback(async (mask: AIMask): Promise<AIMask> => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = mask.url;
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });

    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;

    return {
      ...mask,
      image: img,
      alphaData: data,
      width: img.width,
      height: img.height,
    };
  }, []);

  // --- Load AI masks ---
  useEffect(() => {
    const loadMasks = async () => {
      const masksToLoad = aiMasks.filter((m) => !m.image);
      if (masksToLoad.length === 0) return;

      const updatedMasks: AIMask[] = [...aiMasks];
      for (let i = 0; i < updatedMasks.length; i++) {
        if (!updatedMasks[i].image) {
          try {
            updatedMasks[i] = await preprocessMask(updatedMasks[i]);
          } catch (e) {
            console.error("Mask load error:", e);
          }
        }
      }
      setAiMasks(updatedMasks);
    };
    loadMasks();
  }, [aiMasks, preprocessMask]);

  // --- Get relative pointer position ---
  const getRelativePointerPosition = (stage: KonvaStage) => {
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    return transform.point(pointer);
  };

  // --- Find masks under cursor ---
  const getMasksUnderCursor = (pos: { x: number; y: number } | null) => {
    if (!pos || aiMasks.length === 0) return [];
    const masks: number[] = [];
    aiMasks.forEach((mask, i) => {
      if (!mask.image || !mask.alphaData || !mask.width || !mask.height) return;
      
      // Scale position to mask coordinates
      const px = Math.floor((pos.x / canvasSize.width) * mask.width);
      const py = Math.floor((pos.y / canvasSize.height) * mask.height);
      
      if (px < 0 || py < 0 || px >= mask.width || py >= mask.height) return;
      const alpha = mask.alphaData[(py * mask.width + px) * 4 + 3];
      if (alpha > 10) masks.push(i);
    });
    return masks;
  };

  const pickSmallestMask = (masksAtCursor: number[]): number | null => {
    if (masksAtCursor.length === 0) return null;
    return masksAtCursor.reduce((minIdx, i) => {
      const mask = aiMasks[i];
      const minMask = aiMasks[minIdx];
      if (!mask?.alphaData) return minIdx;
      if (!minMask?.alphaData) return i;

      const area = mask.alphaData.filter((_, idx) => idx % 4 === 3 && mask.alphaData![idx] > 10).length;
      const minArea = minMask.alphaData.filter((_, idx) => idx % 4 === 3 && minMask.alphaData![idx] > 10).length;

      return area < minArea ? i : minIdx;
    }, masksAtCursor[0]!);
  };

  // --- Handle stage click ---
  const handleStageClick = (e: any) => {
    if (aiMasks.length === 0) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pos = getRelativePointerPosition(stage);
    if (!pos) return;

    const masksAtCursor = getMasksUnderCursor(pos);
    const largestMaskIndex = pickSmallestMask(masksAtCursor);
    if (largestMaskIndex === null) return;

    setSelectedMaskIndices((prev) =>
      prev.includes(largestMaskIndex)
        ? prev.filter((idx) => idx !== largestMaskIndex)
        : [...prev, largestMaskIndex]
    );
  };

  // --- Handle mouse down ---
  const handleMouseDown = (e: any) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = getRelativePointerPosition(stage);
    if (!pos) return;

    const masksAtCursor = getMasksUnderCursor(pos);
    const largestMaskIndex = pickSmallestMask(masksAtCursor);
    if (largestMaskIndex !== null) {
      setHoveredMaskIndex(largestMaskIndex);
      return; // don't draw over mask
    }

    if (drawingMode === "free" || drawingMode === "lasso") {
      setIsDrawing(true);
      setLines((prev) => [
        ...prev,
        {
          points: [pos],
          brushSize,
          color: tool === "brush" ? "black" : "white",
          closed: drawingMode === "lasso",
        },
      ]);
    } else if (drawingMode === "rectangle") {
      setSelectionStart(pos);
      setSelection({ x: pos.x, y: pos.y, width: 0, height: 0 });
      setIsDrawing(true);
    }
  };

  // --- Handle mouse move ---
  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = getRelativePointerPosition(stage);
    if (!pos) return;

    const masksAtCursor = getMasksUnderCursor(pos);
    const largestMaskIndex = pickSmallestMask(masksAtCursor);
    setHoveredMaskIndex(largestMaskIndex);

    if (!isDrawing) return;

    if (drawingMode === "free" || drawingMode === "lasso") {
      setLines((prev) => {
        const newLines = [...prev];
        const last = { ...newLines[newLines.length - 1] };
        last.points = [...last.points, pos];
        newLines[newLines.length - 1] = last;
        return newLines;
      });
    } else if (drawingMode === "rectangle" && selectionStart) {
      const sx = selectionStart.x,
        sy = selectionStart.y;
      setSelection({
        x: Math.min(sx, pos.x),
        y: Math.min(sy, pos.y),
        width: Math.abs(pos.x - sx),
        height: Math.abs(pos.y - sy),
      });
    }
  };

  // --- Handle mouse up ---
  const handleMouseUp = () => {
    if (!isDrawing) return;

    if (drawingMode === "lasso") {
      setLines((prev) => {
        const newLines = [...prev];
        const last = { ...newLines[newLines.length - 1] };
        if (last.points.length > 2) {
          last.points.push(last.points[0]);
          last.closed = true;
          newLines[newLines.length - 1] = last;
        }
        return newLines;
      });
    } else if (drawingMode === "rectangle" && selection) {
      const rectPoints = [
        { x: selection.x, y: selection.y },
        { x: selection.x + selection.width, y: selection.y },
        { x: selection.x + selection.width, y: selection.y + selection.height },
        { x: selection.x, y: selection.y + selection.height },
      ];
      setLines((prev) => [
        ...prev,
        { points: rectPoints, brushSize: 2, color: "black", closed: true },
      ]);
      setSelectionStart(null);
      setSelection(null);
    }
    setIsDrawing(false);
  };

  // --- Reset all ---
  const resetAll = () => {
    setLines([]);
    setSelection(null);
    setSelectionStart(null);
    setIsDrawing(false);
    setTool("brush");
    setDrawingMode("free");
    setAiMasks([]);
    setSelectedMaskIndices([]);
    setHoveredMaskIndex(null);
  };

  // --- Handle AI Mask ---
  const handleAIMask = async () => {
    if (!baseImage) return;
    setAiProcessing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = baseImage.naturalWidth;
      canvas.height = baseImage.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(baseImage, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) return;

      const formData = new FormData();
      formData.append("image", blob, "image.png");
      formData.append("model", "sam-vit-h");
      const sessionId = localStorage.getItem("session_id");
      const res = await fetch("/api/get_masks", {
        method: "POST",
        headers: {...(sessionId ? { "X-Session-ID": sessionId } : {}),},
        body: formData,
      });
      if (!res.ok) {
        console.error(await res.text());
        setAiProcessing(false);
        return;
      }

      const { job_id } = await res.json();
      const poll = async (jobId: number): Promise<string[]> => {
        const statusRes = await fetch(`/api/get_masks_status/${jobId}`);
        const data = await statusRes.json();
        if (data.status === "done") return data.masks || [];
        await new Promise((r) => setTimeout(r, 2000));
        return poll(jobId);
      };

      const maskUrls = await poll(job_id);
      setAiMasks(maskUrls.map((url) => ({ url, image: null })));
    } catch (err) {
      console.error(err);
    } finally {
      setAiProcessing(false);
    }
  };

  // --- Merge selected masks ---
  const mergeSelectedMasks = () => {
    if (!baseImage) return;
    const width = baseImage.naturalWidth;
    const height = baseImage.naturalHeight;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = width;
    tempCanvas.height = height;
    const ctx = tempCanvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);

    const finalMask = ctx.getImageData(0, 0, width, height);
    const finalData = finalMask.data;

    // Sort masks by area (largest first)
    const masksWithArea = selectedMaskIndices.map((idx) => {
      const mask = aiMasks[idx];
      if (!mask.alphaData || !mask.width || !mask.height) return { idx, area: 0 };
      let area = 0;
      for (let i = 3; i < mask.alphaData.length; i += 4) {
        if (mask.alphaData[i] > 10) area++;
      }
      return { idx, area };
    });

    const sortedIndices = masksWithArea.sort((a, b) => b.area - a.area).map(m => m.idx);

    // Apply masks in order of size
    sortedIndices.forEach((index) => {
      const mask = aiMasks[index];
      if (!mask?.alphaData || !mask.width || !mask.height) return;

      // Calculate scaling factors
      const scaleX = width / mask.width;
      const scaleY = height / mask.height;

      // Sample mask data and apply to final mask
      for (let y = 0; y < height; y++) {
        const maskY = Math.floor(y / scaleY);
        for (let x = 0; x < width; x++) {
          const maskX = Math.floor(x / scaleX);
          const maskIdx = (maskY * mask.width + maskX) * 4;
          const alpha = mask.alphaData[maskIdx + 3];
          const finalIdx = (y * width + x) * 4;

          if (alpha > 10) {
            finalData[finalIdx + 0] = 0;  // R
            finalData[finalIdx + 1] = 0;  // G
            finalData[finalIdx + 2] = 0;  // B
            finalData[finalIdx + 3] = 255;  // A
          }
        }
      }
    });

    ctx.putImageData(finalMask, 0, 0);
    onMaskExport(tempCanvas.toDataURL("image/png"));
    setSelectedMaskIndices([]);
  };

  // --- Export drawings ---
  useEffect(() => {
    if (!baseImage || canvasSize.width === 0 || canvasSize.height === 0) return;
    
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = baseImage.naturalWidth;
    tempCanvas.height = baseImage.naturalHeight;
    const ctx = tempCanvas.getContext("2d");
    if (!ctx) return;

    // Start with white background
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Calculate scale factors for converting from canvas coordinates to image coordinates
    const scaleX = baseImage.naturalWidth / canvasSize.width;
    const scaleY = baseImage.naturalHeight / canvasSize.height;

    // Draw all lines
    lines.forEach((line) => {
      if (line.points.length < 2) return;
      
      ctx.beginPath();
      ctx.moveTo(line.points[0].x * scaleX, line.points[0].y * scaleY);
      
      for (let i = 1; i < line.points.length; i++) {
        ctx.lineTo(line.points[i].x * scaleX, line.points[i].y * scaleY);
      }
      
      // Adjust line width based on scale
      const avgScale = (scaleX + scaleY) / 2;
      ctx.lineWidth = line.brushSize * avgScale;
      ctx.strokeStyle = line.color === "black" ? "black" : "white";
      
      if (line.closed) {
        ctx.closePath();
        ctx.fillStyle = "black";
        ctx.fill();
      }
      
      ctx.stroke();
    });

    // Export the result
    const dataUrl = tempCanvas.toDataURL("image/png");
    onMaskExport(dataUrl);
  }, [lines, baseImage, canvasSize, onMaskExport]);

  const throttledMouseMove = throttle(handleMouseMove, 30);

  // --- Render ---
  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className={`flex flex-wrap gap-3 p-4 rounded-xl transition-all duration-300 ${
        darkMode 
          ? 'bg-gray-800/80 backdrop-blur-sm border border-gray-700' 
          : 'bg-white/90 backdrop-blur-sm shadow-sm border border-gray-200'
      }`}>
        <div className="flex items-center space-x-2">
          <label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Brush Size:
          </label>
          <input
            type="range"
            min="1"
            max="50"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            disabled={drawingMode === "rectangle"}
            className={`w-20 h-2 rounded-lg appearance-none cursor-pointer ${
              darkMode 
                ? 'bg-gray-700 slider-dark' 
                : 'bg-gray-200 slider-light'
            }`}
          />
          <span className={`text-sm ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            {brushSize}px
          </span>
        </div>

        <div className="flex flex-wrap gap-2 ml-auto">
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center ${
              drawingMode === "free" && tool === "brush"
                ? darkMode 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'bg-blue-500 text-white shadow-md'
                : darkMode 
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            onClick={() => {
              setTool("brush");
              setDrawingMode("free");
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Brush
          </button>
          
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center ${
              tool === "eraser"
                ? darkMode 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'bg-blue-500 text-white shadow-md'
                : darkMode 
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            onClick={() => {
              setTool("eraser");
              setDrawingMode("free");
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Eraser
          </button>
          
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center ${
              drawingMode === "lasso"
                ? darkMode 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'bg-blue-500 text-white shadow-md'
                : darkMode 
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            onClick={() => {
              setDrawingMode("lasso");
              setTool("brush");
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Lasso
          </button>
          
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center ${
              drawingMode === "rectangle"
                ? darkMode 
                  ? 'bg-blue-600 text-white shadow-lg' 
                  : 'bg-blue-500 text-white shadow-md'
                : darkMode 
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
            onClick={() => {
              setDrawingMode("rectangle");
              setTool("brush");
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            Rectangle
          </button>
          
          <button
            onClick={resetAll}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center ${
              darkMode 
                ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Reset
          </button>
          
          <button
            onClick={handleAIMask}
            disabled={aiProcessing}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center ${
              aiProcessing
                ? darkMode 
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : darkMode 
                  ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-md' 
                  : 'bg-purple-500 text-white hover:bg-purple-600 shadow-md'
            }`}
          >
            {aiProcessing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Processing...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
                AI Mask
              </>
            )}
          </button>
          
          <button
            onClick={mergeSelectedMasks}
            disabled={selectedMaskIndices.length === 0}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center ${
              selectedMaskIndices.length === 0
                ? darkMode 
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : darkMode 
                  ? 'bg-green-600 text-white hover:bg-green-700 shadow-md' 
                  : 'bg-green-500 text-white hover:bg-green-600 shadow-md'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Confirm ({selectedMaskIndices.length})
          </button>
        </div>
      </div>

      {/* Status Message */}
      <div className={`text-sm p-3 rounded-lg ${
        darkMode 
          ? 'bg-gray-800/60 text-gray-300' 
          : 'bg-blue-50 text-blue-700'
      }`}>
        {hoveredMaskIndex !== null ? (
          <span>Click to select mask</span>
        ) : (
          <span>Draw on the image to select the area you want to modify</span>
        )}
        {selectedMaskIndices.length > 0 && (
          <span className="ml-2"> | {selectedMaskIndices.length} mask(s) selected</span>
        )}
      </div>

      {/* Canvas Container */}
      <div
        ref={containerRef}
        className={`rounded-xl overflow-hidden transition-all duration-300 ${
          darkMode 
            ? 'bg-gray-800/80 border border-gray-700 shadow-2xl' 
            : 'bg-white/90 border border-gray-200 shadow-xl'
        } inline-block`}
        style={{ 
          boxShadow: darkMode ? '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
        }}
      >
        <Stage
          ref={stageRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseDown={handleMouseDown}
          onMouseMove={throttledMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleStageClick}
          style={{
            cursor:
              drawingMode === "lasso"
                ? "crosshair"
                : hoveredMaskIndex !== null
                ? "pointer"
                : "default",
          }}
        >
          <Layer>
            <KonvaImage
              image={baseImage}
              width={canvasSize.width}
              height={canvasSize.height}
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
                fill={line.closed ? "rgba(0,0,0,0.3)" : undefined}
              />
            ))}
            {selection && (
              <Rect
                x={selection.x}
                y={selection.y}
                width={selection.width}
                height={selection.height}
                stroke="#3b82f6"
                strokeWidth={2}
                dash={[8, 4]}
                opacity={0.8}
              />
            )}
          </Layer>

          <Layer>
            {aiMasks.map((mask, i) => {
              if (!mask.image) return null;
              const isHovered = i === hoveredMaskIndex;
              const isSelected = selectedMaskIndices.includes(i);
              return (
                <KonvaImage
                  key={i}
                  image={mask.image}
                  opacity={isSelected ? 0.7 : isHovered ? 0.4 : 0.2}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  onMouseEnter={() => setHoveredMaskIndex(i)}
                  onMouseLeave={() => setHoveredMaskIndex(null)}
                />
              );
            })}
          </Layer>
        </Stage>
      </div>
    </div>
  );
};

export default MaskingCanvas;