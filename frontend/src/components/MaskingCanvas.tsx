import { useRef, useState, useEffect, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Rect } from "react-konva";
import type { Stage as KonvaStage } from "konva/lib/Stage";

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

interface AIMask {
  url: string;
  image: HTMLImageElement | null;
  alphaData?: Uint8ClampedArray;
  width?: number;
  height?: number;
}

const MaskingCanvas = ({ baseImage, onMaskExport }: MaskingCanvasProps) => {
  const stageRef = useRef<KonvaStage>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [lines, setLines] = useState<LineData[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(10);
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const [drawingMode, setDrawingMode] = useState<"free" | "lasso" | "rectangle">("free");
  const [selection, setSelection] = useState<Selection>(null);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const [aiMasks, setAiMasks] = useState<AIMask[]>([]);
  const [hoveredMaskIndex, setHoveredMaskIndex] = useState<number | null>(null);
  const [selectedMaskIndices, setSelectedMaskIndices] = useState<number[]>([]);
  const [aiProcessing, setAiProcessing] = useState(false);

  // --- Dopasowanie Stage do obrazu ---
  useEffect(() => {
    if (!baseImage) return;
    setCanvasSize({ width: baseImage.naturalWidth, height: baseImage.naturalHeight });
  }, [baseImage]);

  // --- Preprocess maski ---
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

  // --- Load masek AI ---
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

  // --- Pozycja kursora względem stage ---
  const getRelativePointerPosition = (stage: KonvaStage) => {
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    const transform = stage.getAbsoluteTransform().copy();
    transform.invert();
    return transform.point(pointer);
  };

  // --- Znajdź maskę pod kursorem ---
  const getMaskUnderCursor = (pos: { x: number; y: number } | null) => {
    if (!pos) return null;

    for (let i = aiMasks.length - 1; i >= 0; i--) {
      const mask = aiMasks[i];
      if (!mask.image || !mask.alphaData || !mask.width || !mask.height) continue;

      // przeskaluj pozycję kursora z canvasa do rozdzielczości maski
      const px = Math.floor((pos.x / canvasSize.width) * mask.width);
      const py = Math.floor((pos.y / canvasSize.height) * mask.height);

      if (px < 0 || py < 0 || px >= mask.width || py >= mask.height) continue;

      const alpha = mask.alphaData[(py * mask.width + px) * 4 + 3];
      if (alpha > 10) return i;
    }
    return null;
  };

  // --- Obsługa kliknięcia maski ---
  const handleStageClick = (e: any) => {
    const stage = stageRef.current;
    if (!stage) return;

    const pos = getRelativePointerPosition(stage);
    if (!pos) return;

    const maskIndex = getMaskUnderCursor(pos);
    if (maskIndex === null) return;

    setSelectedMaskIndices((prev) =>
      prev.includes(maskIndex)
        ? prev.filter((idx) => idx !== maskIndex)
        : [...prev, maskIndex]
    );
  };

  // --- Rysowanie ---
  const handleMouseDown = (e: any) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = getRelativePointerPosition(stage);
    if (!pos) return;

    const hovered = getMaskUnderCursor(pos);
    if (hovered !== null) return; // nie rysuj nad maską

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

  const handleMouseMove = (e: any) => {
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = getRelativePointerPosition(stage);
    if (!pos) return;

    setHoveredMaskIndex(getMaskUnderCursor(pos));

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

  // --- Eksport rysunków (nie masek AI) ---
  useEffect(() => {
    if (!baseImage) return;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = baseImage.naturalWidth;
    tempCanvas.height = baseImage.naturalHeight;
    const ctx = tempCanvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    const scaleX = baseImage.naturalWidth / canvasSize.width;
    const scaleY = baseImage.naturalHeight / canvasSize.height;

    lines.forEach((line) => {
      if (line.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(line.points[0].x * scaleX, line.points[0].y * scaleY);
      for (let i = 1; i < line.points.length; i++)
        ctx.lineTo(line.points[i].x * scaleX, line.points[i].y * scaleY);
      ctx.lineWidth = line.brushSize * ((scaleX + scaleY) / 2);
      ctx.strokeStyle = line.color === "black" ? "black" : "white";
      if (line.closed) {
        ctx.closePath();
        ctx.fillStyle = "black";
        ctx.fill();
      }
      ctx.stroke();
    });

    const dataUrl = tempCanvas.toDataURL("image/png");
    onMaskExport(dataUrl);
  }, [lines, baseImage, canvasSize, onMaskExport]);

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

      const res = await fetch("/api/get_masks", {
        method: "POST",
        headers: { "X-Session-ID": "my-session-id" },
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

  // Tworzymy finalną maskę binarną
  const finalMask = ctx.getImageData(0, 0, width, height);
  const finalData = finalMask.data;

  // Sortowanie masek po powierzchni (największa na spodzie)
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

  // Iterujemy maski i nakładamy je na finalną
  sortedIndices.forEach((index) => {
    const mask = aiMasks[index];
    if (!mask?.alphaData || !mask.width || !mask.height) return;

    const scaleX = width / mask.width;
    const scaleY = height / mask.height;

    for (let y = 0; y < height; y++) {
      const maskY = Math.floor(y / scaleY);
      for (let x = 0; x < width; x++) {
        const maskX = Math.floor(x / scaleX);
        const maskIdx = (maskY * mask.width + maskX) * 4;
        const alpha = mask.alphaData[maskIdx + 3];
        const finalIdx = (y * width + x) * 4;

        // Nadpisujemy tylko jeśli piksel maski nieprzezroczysty
        if (alpha > 10) {
          finalData[finalIdx + 0] = 0; // black
          finalData[finalIdx + 1] = 0;
          finalData[finalIdx + 2] = 0;
          finalData[finalIdx + 3] = 255; // alpha
        }
      }
    }
  });

  ctx.putImageData(finalMask, 0, 0);
  onMaskExport(tempCanvas.toDataURL("image/png"));
  setSelectedMaskIndices([]);
};


  // --- Render ---
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
            disabled={drawingMode === "rectangle"}
          />
          {brushSize}px
        </label>
        <button
          className={drawingMode === "free" && tool === "brush" ? "active-tool" : ""}
          onClick={() => {
            setTool("brush");
            setDrawingMode("free");
          }}
        >
          Brush
        </button>
        <button
          className={tool === "eraser" ? "active-tool" : ""}
          onClick={() => {
            setTool("eraser");
            setDrawingMode("free");
          }}
        >
          Eraser
        </button>
        <button
          className={drawingMode === "lasso" ? "active-tool" : ""}
          onClick={() => {
            setDrawingMode("lasso");
            setTool("brush");
          }}
        >
          Lasso Select
        </button>
        <button
          className={drawingMode === "rectangle" ? "active-tool" : ""}
          onClick={() => {
            setDrawingMode("rectangle");
            setTool("brush");
          }}
        >
          Rect Select
        </button>
        <button onClick={resetAll}>Reset</button>
        <button onClick={handleAIMask} disabled={aiProcessing}>
          {aiProcessing ? "Processing AI..." : "Mask with AI"}
        </button>
        <button
          onClick={mergeSelectedMasks}
          disabled={selectedMaskIndices.length === 0}
        >
          Confirm AI Masks ({selectedMaskIndices.length})
        </button>
      </div>

      <div className="text-sm text-gray-600">
        {hoveredMaskIndex !== null ? "Click to select mask" : "Draw or select masks"}
        {selectedMaskIndices.length > 0 &&
          ` | ${selectedMaskIndices.length} mask(s) selected`}
      </div>

      <div
        ref={containerRef}
        style={{ border: "1px solid #ccc", display: "inline-block" }}
      >
        <Stage
          ref={stageRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
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
                stroke="black"
                dash={[4, 4]}
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
