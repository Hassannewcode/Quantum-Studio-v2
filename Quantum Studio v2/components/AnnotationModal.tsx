import React, { useState, useEffect, useRef, useCallback } from 'react';
import { XCircleIcon } from './icons/XCircleIcon';
import { PencilIcon } from './icons/PencilIcon';
import { RectangleIcon } from './icons/RectangleIcon';
import { HighlighterIcon } from './icons/HighlighterIcon';
import { UndoIcon } from './icons/UndoIcon';

interface AnnotationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (imageDataUrl: string) => void;
    screenshotDataUrl: string;
}

type Tool = 'draw' | 'rect' | 'highlight';

const COLORS = [
    { name: 'Red', value: '#ef4444' },
    { name: 'Blue', value: '#3b82f6' },
    { name: 'Yellow', value: '#f59e0b' },
    { name: 'Green', value: '#22c55e' },
];

const LINE_WIDTHS = [
    { name: 'Thin', value: 2 },
    { name: 'Medium', value: 5 },
    { name: 'Thick', value: 10 },
];

export const AnnotationModal: React.FC<AnnotationModalProps> = ({ isOpen, onClose, onConfirm, screenshotDataUrl }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const historyRef = useRef<ImageData[]>([]);
    
    const [isDrawing, setIsDrawing] = useState(false);
    const [tool, setTool] = useState<Tool>('draw');
    const [color, setColor] = useState(COLORS[0].value);
    const [lineWidth, setLineWidth] = useState(LINE_WIDTHS[1].value);
    const [startPoint, setStartPoint] = useState<{ x: number, y: number } | null>(null);

    const getContext = useCallback(() => canvasRef.current?.getContext('2d'), []);

    const redrawCanvas = useCallback(() => {
        const ctx = getContext();
        const canvas = canvasRef.current;
        if (!ctx || !canvas || !imageRef.current) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imageRef.current, 0, 0);
    }, [getContext]);

    const setupCanvas = useCallback(() => {
        if (!canvasRef.current || imageRef.current) return;

        const image = new Image();
        image.src = screenshotDataUrl;
        image.onload = () => {
            imageRef.current = image;
            const canvas = canvasRef.current!;
            const ctx = getContext()!;
            canvas.width = image.width;
            canvas.height = image.height;
            redrawCanvas();
            historyRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
        };
    }, [screenshotDataUrl, getContext, redrawCanvas]);

    useEffect(() => {
        if (isOpen) {
            setupCanvas();
        } else {
            imageRef.current = null;
            historyRef.current = [];
        }
    }, [isOpen, setupCanvas]);

    const getMousePos = (e: React.MouseEvent): { x: number, y: number } => {
        const rect = canvasRef.current!.getBoundingClientRect();
        const canvas = canvasRef.current!;
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height),
        };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const ctx = getContext();
        if (!ctx) return;
        
        historyRef.current.push(ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height));

        const { x, y } = getMousePos(e);
        setStartPoint({ x, y });
        setIsDrawing(true);

        ctx.strokeStyle = tool === 'highlight' ? `${color}80` : color;
        ctx.lineWidth = tool === 'highlight' ? LINE_WIDTHS[2].value * 2 : lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (tool === 'draw' || tool === 'highlight') {
            ctx.beginPath();
            ctx.moveTo(x, y);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing || !startPoint) return;
        const ctx = getContext();
        if (!ctx) return;
        const { x, y } = getMousePos(e);

        if (tool === 'rect' || (tool === 'highlight' && e.shiftKey)) { // highlighter rect with shift
            const lastState = historyRef.current[historyRef.current.length - 1];
            ctx.putImageData(lastState, 0, 0);
            ctx.beginPath();
            ctx.rect(startPoint.x, startPoint.y, x - startPoint.x, y - startPoint.y);
            ctx.stroke();
        } else if (tool === 'draw' || tool === 'highlight') {
            ctx.lineTo(x, y);
            ctx.stroke();
        }
    };
    
    const handleMouseUp = () => {
        setIsDrawing(false);
        setStartPoint(null);
    };
    
    const handleUndo = () => {
        if (historyRef.current.length > 1) {
            const lastState = historyRef.current.pop();
            const ctx = getContext();
            if (ctx && lastState) {
                 ctx.putImageData(historyRef.current[historyRef.current.length - 1], 0, 0);
            }
        }
    }

    const handleConfirm = () => {
        const canvas = canvasRef.current;
        if (canvas) onConfirm(canvas.toDataURL('image/jpeg', 0.9));
    };

    const ToolButton = ({ id, icon, title }: { id: Tool; icon: React.ReactNode; title: string }) => (
        <button onClick={() => setTool(id)} title={title} className={`p-2 rounded-md transition-colors ${tool === id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-600 hover:text-white'}`}>{icon}</button>
    );

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onMouseDown={onClose}>
            <div 
                className="relative flex flex-col bg-[#1E1E1E] border border-gray-700 rounded-lg shadow-2xl w-full max-w-6xl h-full max-h-[90vh] text-white"
                onMouseDown={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-2.5 border-b border-gray-700 shrink-0">
                    <h3 className="font-bold text-lg text-gray-200">Annotate Screenshot</h3>
                    <div className="flex items-center gap-6">
                        {/* Tools */}
                        <div className="flex items-center gap-1 p-1 bg-gray-900/50 rounded-lg">
                           <ToolButton id="draw" title="Pencil" icon={<PencilIcon className="w-5 h-5"/>} />
                           <ToolButton id="highlight" title="Highlighter (Hold Shift for Rectangle)" icon={<HighlighterIcon className="w-5 h-5"/>} />
                           <ToolButton id="rect" title="Rectangle" icon={<RectangleIcon className="w-5 h-5"/>} />
                        </div>
                        {/* Colors */}
                        <div className="flex items-center gap-2">
                            {COLORS.map(c => (
                                <button key={c.name} onClick={() => setColor(c.value)} style={{ backgroundColor: c.value }} className={`w-6 h-6 rounded-full transition-transform transform hover:scale-110 ${color === c.value ? 'ring-2 ring-offset-2 ring-offset-gray-800 ring-white' : ''}`}></button>
                            ))}
                        </div>
                        {/* Line Width */}
                         <div className="flex items-center gap-2 p-1 bg-gray-900/50 rounded-lg">
                            {LINE_WIDTHS.map(lw => (
                                <button key={lw.name} onClick={() => setLineWidth(lw.value)} className={`px-2 py-1 text-xs rounded-md ${lineWidth === lw.value ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>{lw.name}</button>
                            ))}
                        </div>
                         {/* Actions */}
                         <div className="flex items-center gap-1">
                            <button onClick={handleUndo} title="Undo" className="p-2 rounded-md text-gray-400 hover:bg-gray-600 hover:text-white"><UndoIcon className="w-5 h-5"/></button>
                            <button onClick={onClose} aria-label="Close annotation" className="p-2 rounded-md text-gray-400 hover:bg-gray-600 hover:text-white">
                                <XCircleIcon className="h-6 w-6" />
                            </button>
                        </div>
                    </div>
                </header>
                <main className="p-4 overflow-auto flex-grow bg-gray-900/50 flex justify-center items-center">
                    <canvas
                        ref={canvasRef}
                        className="max-w-full max-h-full object-contain cursor-crosshair rounded-sm shadow-lg"
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                    />
                </main>
                 <footer className="p-3 border-t border-gray-700 flex justify-end items-center gap-4">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-md transition-colors bg-gray-600 hover:bg-gray-500 text-white">
                        Cancel
                    </button>
                    <button onClick={handleConfirm} className="px-4 py-2 text-sm font-semibold rounded-md transition-colors bg-blue-600 hover:bg-blue-500 text-white">
                        Confirm and Attach
                    </button>
                </footer>
            </div>
        </div>
    );
};