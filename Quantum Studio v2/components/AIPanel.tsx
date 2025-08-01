import React, { useRef, useEffect } from 'react';
import type { AITask, SelectedElement, AttachmentContext } from '../types';
import { AITaskItem } from './AITaskItem';
import { Switch } from './Switch';
import { XCircleIcon } from './icons/XCircleIcon';
import { PlusCircleIcon } from './icons/PlusCircleIcon';

interface AIPanelProps {
    tasks: AITask[];
    onSendMessage: (prompt: string) => void;
    isLoading: boolean;
    prompt: string;
    onPromptChange: (newPrompt: string) => void;
    onApproveTask: (taskId: string) => void;
    onRejectTask: (taskId: string) => void;
    onApproveBlueprint: (taskId: string) => void;
    isAutoPilotOn: boolean;
    onToggleAutoPilot: () => void;
    elementContext: SelectedElement | null;
    attachmentContext: AttachmentContext | null;
    onClearContext: () => void;
    onFileUploadForContext: (file: File) => void;
}

export const AIPanel: React.FC<AIPanelProps> = ({
    tasks,
    onSendMessage,
    isLoading,
    prompt,
    onPromptChange,
    onApproveTask,
    onRejectTask,
    onApproveBlueprint,
    isAutoPilotOn,
    onToggleAutoPilot,
    elementContext,
    attachmentContext,
    onClearContext,
    onFileUploadForContext
}) => {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [tasks.length]);
    
    const handleSend = () => {
        if (prompt.trim()) {
            onSendMessage(prompt);
        }
    };

    const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };
    
    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onFileUploadForContext(file);
        }
        if(event.target) {
            event.target.value = '';
        }
    };


    return (
        <div className="bg-[#1E1E1E] flex flex-col h-full">
            <div className="p-4 border-b border-gray-700">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-200">AI Assistant</h2>
                     <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold uppercase ${isAutoPilotOn ? 'text-blue-400' : 'text-gray-500'}`}>Auto-Pilot</span>
                        <Switch isOn={isAutoPilotOn} onToggle={onToggleAutoPilot} id="autopilot-switch" />
                    </div>
                </div>
                <p className="text-sm text-gray-400 mt-1">The AI can work proactively or on-demand.</p>
            </div>
            <div className="flex-grow p-4 overflow-y-auto space-y-4">
                 <div ref={messagesEndRef} />
                {tasks.length === 0 && (
                    <div className="text-center text-gray-500 pt-16">
                        <p>No tasks yet.</p>
                        <p>Ask the AI for a high-level idea to start a plan.</p>
                    </div>
                )}
                {tasks.map(task => (
                    <AITaskItem 
                        key={task.id} 
                        task={task} 
                        onApprove={onApproveTask}
                        onReject={onRejectTask}
                        onApproveBlueprint={onApproveBlueprint}
                    />
                ))}
            </div>
            <div className="p-4 border-t border-gray-700 bg-[#181818]">
                {(elementContext || attachmentContext) && (
                    <div className="mb-2 p-2 bg-gray-700/50 rounded-md text-xs relative border border-gray-600">
                        <button onClick={onClearContext} className="absolute top-1 right-1 p-0.5 text-gray-400 hover:text-white" title="Clear context">
                            <XCircleIcon className="w-4 h-4" />
                        </button>
                        {elementContext && (
                            <div className="mb-1">
                                <span className="font-bold text-gray-300">Element Context:</span> 
                                <code className="ml-2 bg-gray-800 p-1 rounded font-mono text-blue-300" title={elementContext.selector}>{elementContext.selector}</code>
                            </div>
                        )}
                        {attachmentContext && (
                            <div className={`flex items-center gap-2 ${elementContext ? 'mt-1' : ''}`}>
                                <span className="font-bold text-gray-300">File Attachment:</span>
                                {attachmentContext.type === 'image' ? (
                                    <img src={attachmentContext.data} alt={`${attachmentContext.name} thumbnail`} className="h-10 w-auto border border-gray-500 rounded" />
                                ) : (
                                    <span className="font-mono bg-gray-800 p-1 rounded text-blue-300 truncate" title={attachmentContext.name}>{attachmentContext.name}</span>
                                )}
                            </div>
                        )}
                    </div>
                )}
                <div className="relative">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept="image/*,text/*,.tsx,.ts,.js,.jsx,.json,.css,.html,.md"
                        aria-hidden="true"
                    />
                     <button
                        onClick={handleUploadClick}
                        className="absolute bottom-2.5 left-2.5 p-1 text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Attach File"
                        disabled={isAutoPilotOn || !!attachmentContext}
                    >
                        <PlusCircleIcon className="w-7 h-7" />
                    </button>
                    <textarea
                        value={prompt}
                        onChange={(e) => onPromptChange(e.target.value)}
                        onKeyDown={handlePromptKeyDown}
                        placeholder={isAutoPilotOn ? "Auto-Pilot is active. Turn it off to send a message." : "Ask the AI to build or change something..."}
                        aria-label="Chat prompt"
                        rows={3}
                        className="w-full p-2 pl-12 pr-24 bg-gray-800 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all resize-none text-white"
                        disabled={isLoading || isAutoPilotOn}
                    />
                     <button
                        onClick={handleSend}
                        disabled={!prompt.trim() || isLoading || isAutoPilotOn}
                        className="absolute bottom-2.5 right-2.5 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
                        aria-label="Send message"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
};
