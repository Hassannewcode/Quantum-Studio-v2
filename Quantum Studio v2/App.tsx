import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import html2canvas from 'html2canvas';
import { AIPanel } from './components/AIPanel';
import { WebsitePreview } from './components/WebsitePreview';
import { Sidebar } from './components/Sidebar';
import { FileExplorer } from './components/FileExplorer';
import { ExtensionsPanel } from './components/ExtensionsPanel';
import { OverlayPanel } from './components/OverlayPanel';
import { ContextMenu, ContextMenuItem } from './components/ContextMenu';
import { CodePreviewModal } from './components/CodePreviewModal';
import { AnnotationModal } from './components/AnnotationModal';
import { CodeEditor } from './components/CodeEditor';
import { InputModal } from './components/InputModal';
import * as geminiService from './services/geminiService';
import type { AITask, FileSystemTree, FileSystemNode, FileOperation, LogMessage, Workspace, FileNode, ActivePanelId, WorkspaceUiState, OverlayPanelId, FolderNode, SelectedElement, AttachmentContext, AppBlueprint } from './types';
import { WorkspacesPanel } from './components/WorkspacesPanel';

import { QuantumCodeLogo } from './components/icons/QuantumCodeLogo';
import { AIAssistantIcon } from './components/icons/AIAssistantIcon';
import { ExtensionsIcon } from './components/icons/ExtensionsIcon';
import { FileExplorerIcon } from './components/icons/FileExplorerIcon';
import { WorkspaceIcon } from './components/icons/WorkspaceIcon';
import { LoaderIcon } from './components/icons/LoaderIcon';

const INITIAL_CODE = `// Welcome to Quantum Code!
// Your root component must be named 'App'.
// Try asking the AI for a big idea, like "build an app like Obsidian.md".
// The AI will first create a plan. Approve it, and watch it build!
// Or, enable Auto-Pilot and see what it comes up with on its own.

// React is available globally in the preview, no import needed.
function App() {
  return (
    <div className="p-8 text-center bg-gray-100 h-screen flex flex-col justify-center items-center">
      <h1 className="text-4xl font-bold text-gray-800 mb-4">
        Quantum Code Live Preview
      </h1>
      <p className="text-lg text-gray-600 mb-6">
        Ask the AI on the right to build something!
      </p>
    </div>
  );
}`;

const INITIAL_FILES: FileSystemTree = {
  type: 'folder',
  children: {
    'src': {
      type: 'folder',
      children: {
        'App.tsx': {
          type: 'file',
          content: INITIAL_CODE,
        },
      },
    },
  },
};

const LOCAL_STORAGE_WORKSPACES_KEY = 'quantum_code_workspaces';
const LOCAL_STORAGE_ACTIVE_WORKSPACE_KEY = 'quantum_code_active_workspace';
const LOCAL_STORAGE_UI_STATES_KEY = 'quantum_code_ui_states';

const DEFAULT_UI_STATE: WorkspaceUiState = {
    activeOverlay: null,
    activeEditorPath: 'src/App.tsx',
    isPreviewFullscreen: false,
    aiPrompt: '',
    previewTab: 'preview',
    isAutoPilotOn: false,
};

// --- File System Utilities ---
const traversePath = (tree: FileSystemTree, path: string, createParents: boolean = false): { parent: FolderNode | null; node: FileSystemNode | null; key: string } => {
    const parts = path.split('/').filter(p => p);
    if (parts.length === 0) return { parent: null, node: tree, key: '' };
    let current: any = tree;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (current.type !== 'folder') return { parent: null, node: null, key: '' };
        let child = current.children[part];
        if (!child) {
            if (createParents) {
                child = { type: 'folder', children: {} };
                current.children[part] = child;
            } else { return { parent: null, node: null, key: '' }; }
        }
        current = child;
    }
    const key = parts[parts.length - 1];
    if (current.type !== 'folder') return { parent: null, node: null, key: '' };
    return { parent: current, node: current.children[key] || null, key };
};

const applyFileOperations = (tree: FileSystemTree, operations: FileOperation[]): FileSystemTree => {
    const newTree = JSON.parse(JSON.stringify(tree));
    for (const op of operations) {
        try {
            switch (op.operation) {
                case 'CREATE_FILE': case 'UPDATE_FILE': {
                    const { parent, key } = traversePath(newTree, op.path, true);
                    if (parent && key) parent.children[key] = { type: 'file', content: op.content || '' };
                    else throw new Error(`Invalid path for CREATE/UPDATE: ${op.path}`);
                    break;
                }
                case 'CREATE_FOLDER': {
                    const { parent, key } = traversePath(newTree, op.path, true);
                    if (parent && key && !parent.children[key]) parent.children[key] = { type: 'folder', children: {} };
                    else if (!parent || !key) throw new Error(`Invalid path for CREATE_FOLDER: ${op.path}`);
                    break;
                }
                case 'DELETE_FILE': case 'DELETE_FOLDER': {
                    const { parent, node, key } = traversePath(newTree, op.path, false);
                    if (parent && node && key) delete parent.children[key];
                    break;
                }
                case 'RENAME_FILE': case 'RENAME_FOLDER': {
                    if (!op.newPath) throw new Error(`Missing newPath for RENAME on ${op.path}`);
                    const { parent: oldParent, node, key: oldKey } = traversePath(newTree, op.path, false);
                    if (!oldParent || !node || !oldKey) throw new Error(`Source path not found for RENAME: ${op.path}`);
                    delete oldParent.children[oldKey];
                    const { parent: newParent, key: newKey } = traversePath(newTree, op.newPath, true);
                    if (newParent && newKey) newParent.children[newKey] = node;
                    else throw new Error(`Invalid destination path for RENAME: ${op.newPath}`);
                    break;
                }
            }
        } catch (e) { console.error(`Failed to apply operation:`, op, e); }
    }
    return newTree;
};

const findNodeByPath = (path: string, tree: FileSystemTree): FileSystemNode | null => {
  const parts = path.split('/').filter(Boolean);
  let current: FileSystemNode | FileSystemTree = tree;
  for (const part of parts) {
      if (current.type === 'folder' && current.children[part]) current = current.children[part];
      else return null;
  }
  return current;
};

const updateFileContent = (tree: FileSystemTree, path: string, newContent: string): FileSystemTree => {
    const newTree = JSON.parse(JSON.stringify(tree));
    const { node } = traversePath(newTree, path);
    if (node && node.type === 'file') node.content = newContent;
    return newTree;
};

const getInstalledExtensions = (): string[] => Object.entries(localStorage).filter(([key, value]) => key.startsWith('ext_') && value === 'true').map(([key]) => key.replace('ext_', ''));

const App: React.FC = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [workspaceUiStates, setWorkspaceUiStates] = useState<{ [id: string]: WorkspaceUiState }>({});
  
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, items: ContextMenuItem[] } | null>(null);
  const [codePreview, setCodePreview] = useState<{ path: string, content: string } | null>(null);
  const [installedExtensions, setInstalledExtensions] = useState<string[]>(getInstalledExtensions());
  const [fixableError, setFixableError] = useState<LogMessage | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<LogMessage[]>([]);
  const [inputModalState, setInputModalState] = useState({ isOpen: false, title: '', label: '', initialValue: '', confirmText: 'Create', onConfirm: (value: string) => {} });
  const closeInputModal = () => setInputModalState(prev => ({ ...prev, isOpen: false }));
  
  const [selectedElementInfo, setSelectedElementInfo] = useState<SelectedElement | null>(null);
  const [attachmentContext, setAttachmentContext] = useState<AttachmentContext | null>(null);
  const [isAnnotationModalOpen, setIsAnnotationModalOpen] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let loadedWorkspaces: Workspace[] = [];
    try {
        const savedData = localStorage.getItem(LOCAL_STORAGE_WORKSPACES_KEY);
        if (savedData) loadedWorkspaces = (JSON.parse(savedData) as Workspace[]).map(ws => ({ ...ws, tasks: ws.tasks.map(t => ({...t, timestamp: new Date(t.timestamp)})) }));
    } catch (error) { console.error("Failed to load workspaces", error); localStorage.removeItem(LOCAL_STORAGE_WORKSPACES_KEY); }

    if (loadedWorkspaces.length === 0) {
        const defaultWorkspace: Workspace = { id: crypto.randomUUID(), name: 'My First Project', fileSystem: INITIAL_FILES, tasks: [], createdAt: new Date().toISOString() };
        setWorkspaces([defaultWorkspace]);
        setActiveWorkspaceId(defaultWorkspace.id);
        setWorkspaceUiStates({ [defaultWorkspace.id]: DEFAULT_UI_STATE });
    } else {
        setWorkspaces(loadedWorkspaces);
        const savedActiveId = localStorage.getItem(LOCAL_STORAGE_ACTIVE_WORKSPACE_KEY);
        setActiveWorkspaceId((savedActiveId && loadedWorkspaces.some(ws => ws.id === savedActiveId)) ? savedActiveId : loadedWorkspaces.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0].id);
        try {
            const savedUiStates = localStorage.getItem(LOCAL_STORAGE_UI_STATES_KEY);
            setWorkspaceUiStates(savedUiStates ? JSON.parse(savedUiStates) : {});
        } catch (error) { console.error("Failed to load UI states", error); localStorage.removeItem(LOCAL_STORAGE_UI_STATES_KEY); }
    }
  }, []);

  useEffect(() => { if (workspaces.length > 0) localStorage.setItem(LOCAL_STORAGE_WORKSPACES_KEY, JSON.stringify(workspaces)); else localStorage.removeItem(LOCAL_STORAGE_WORKSPACES_KEY); }, [workspaces]);
  useEffect(() => { if(activeWorkspaceId) localStorage.setItem(LOCAL_STORAGE_ACTIVE_WORKSPACE_KEY, activeWorkspaceId); }, [activeWorkspaceId]);
  useEffect(() => { if (Object.keys(workspaceUiStates).length > 0) localStorage.setItem(LOCAL_STORAGE_UI_STATES_KEY, JSON.stringify(workspaceUiStates)); }, [workspaceUiStates]);

  const activeWorkspace = useMemo(() => workspaces.find(w => w.id === activeWorkspaceId), [workspaces, activeWorkspaceId]);
  const currentUiState = useMemo(() => (activeWorkspaceId && workspaceUiStates[activeWorkspaceId]) || DEFAULT_UI_STATE, [activeWorkspaceId, workspaceUiStates]);
  
  const updateCurrentUiState = useCallback((key: keyof WorkspaceUiState, value: any) => {
    if (!activeWorkspaceId) return;
    setWorkspaceUiStates(prev => ({ ...prev, [activeWorkspaceId]: { ...(prev[activeWorkspaceId] || DEFAULT_UI_STATE), [key]: value } }));
  }, [activeWorkspaceId]);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleDirectFileOperations = useCallback((operations: FileOperation[]) => { if (!activeWorkspaceId) return; closeContextMenu(); setWorkspaces(prev => prev.map(ws => ws.id !== activeWorkspaceId ? ws : { ...ws, fileSystem: applyFileOperations(ws.fileSystem, operations) })); }, [activeWorkspaceId, closeContextMenu]);

  const handleRequestNewFile = useCallback((basePath?: string) => setInputModalState({ isOpen: true, title: 'Create New File', label: 'Enter the full path for the new file:', initialValue: basePath ? `${basePath}/new-file.tsx` : 'src/new-file.tsx', confirmText: 'Create File', onConfirm: (path) => { if (path?.trim() && !path.trim().endsWith('/')) handleDirectFileOperations([{ operation: 'CREATE_FILE', path: path.trim(), content: '' }]); else alert('Invalid file path.'); }, }), [handleDirectFileOperations]);
  
  const handleRequestNewFolder = useCallback((basePath?: string) => setInputModalState({ isOpen: true, title: 'Create New Folder', label: 'Enter the full path for the new folder:', initialValue: basePath ? `${basePath}/new-folder` : 'src/new-folder', confirmText: 'Create Folder', onConfirm: (path) => { if (path?.trim()) handleDirectFileOperations([{ operation: 'CREATE_FOLDER', path: path.trim() }]); else alert('Invalid folder path.'); }, }), [handleDirectFileOperations]);
  
  const handleFileUpload = useCallback((files: FileList) => { if (!activeWorkspaceId) return; const readFile = (file: File): Promise<{ path: string, content: string }> => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = (event) => resolve({ path: `src/${file.name}`, content: event.target?.result as string }); reader.onerror = (error) => reject(error); reader.readAsText(file); }); const readAllFiles = async () => { try { const operations: FileOperation[] = (await Promise.all(Array.from(files).map(readFile))).map(f => ({ operation: 'CREATE_FILE', path: f.path, content: f.content })); handleDirectFileOperations(operations); } catch (error) { console.error("Error reading uploaded files:", error); alert("Error uploading files. Please ensure they are text files."); } }; readAllFiles(); }, [activeWorkspaceId, handleDirectFileOperations]);

  const runAIGeneration = useCallback(async (prompt: string, imageB64: string | null, taskId: string, isAutoPilot: boolean = false) => {
    if (!activeWorkspaceId) return;
    const currentWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
    if (!currentWorkspace) return;

    try {
        const currentExtensions = getInstalledExtensions();
        const stream = await geminiService.runTaskStream(prompt, currentExtensions, currentWorkspace.fileSystem, currentWorkspace.tasks, currentUiState, consoleLogs, imageB64);
        
        let fullResponseText = "";
        let conversationalPart = "";
        const blueprintSeparator = '---JSON_BLUEPRINT---';
        const opsSeparator = '---JSON_OPERATIONS---';

        for await (const chunk of stream) {
            fullResponseText += chunk;
            const blueprintIdx = fullResponseText.indexOf(blueprintSeparator);
            const opsIdx = fullResponseText.indexOf(opsSeparator);
            const separatorIdx = blueprintIdx !== -1 ? blueprintIdx : opsIdx;
            
            conversationalPart = separatorIdx !== -1 ? fullResponseText.substring(0, separatorIdx) : fullResponseText;
            
            setWorkspaces(prev => prev.map(ws => {
                if (ws.id !== activeWorkspaceId) return ws;
                return { ...ws, tasks: ws.tasks.map(task => task.id === taskId ? { ...task, assistantResponse: { content: conversationalPart } } : task ) };
            }));
        }
        
        let finalConversationalPart = fullResponseText;
        let fileOps: FileOperation[] = [];
        let blueprint: AppBlueprint | null = null;
        let status: AITask['status'] = 'completed';
        
        const blueprintIndex = fullResponseText.indexOf(blueprintSeparator);
        const opsIndex = fullResponseText.indexOf(opsSeparator);

        if (blueprintIndex !== -1) {
            finalConversationalPart = fullResponseText.substring(0, blueprintIndex).trim();
            const jsonPartRaw = fullResponseText.substring(blueprintIndex + blueprintSeparator.length);
            try {
                const jsonString = jsonPartRaw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)?.[1] || jsonPartRaw.trim();
                blueprint = JSON.parse(jsonString) as AppBlueprint;
                status = 'pending_blueprint_approval';
            } catch (e) { throw new Error(`Failed to parse blueprint from AI. ${e instanceof Error ? e.message : ''}`); }
        } else if (opsIndex !== -1) {
            finalConversationalPart = fullResponseText.substring(0, opsIndex).trim();
            const jsonPartRaw = fullResponseText.substring(opsIndex + opsSeparator.length);
            try {
                const jsonString = jsonPartRaw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)?.[1] || jsonPartRaw.trim();
                fileOps = (JSON.parse(jsonString) as { operations: FileOperation[] }).operations || [];
                status = isAutoPilot ? 'completed' : 'pending_confirmation';
            } catch (e) { throw new Error(`Failed to parse file operations from AI. ${e instanceof Error ? e.message : ''}`); }
        }

        setWorkspaces(prev => prev.map(ws => {
            if (ws.id !== activeWorkspaceId) return ws;
            let newFileSystem = ws.fileSystem;
            if (isAutoPilot && fileOps.length > 0) {
                newFileSystem = applyFileOperations(ws.fileSystem, fileOps);
            }
            const finalTasks = ws.tasks.map((task): AITask => task.id === taskId ? { ...task, status, assistantResponse: { content: finalConversationalPart, operations: fileOps, blueprint: blueprint || undefined } } : task );
            return { ...ws, fileSystem: newFileSystem, tasks: finalTasks };
        }));

    } catch (error) {
        console.error(`Error during task execution (ID: ${taskId}):`, error);
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
        setWorkspaces(prev => prev.map(ws => ws.id === activeWorkspaceId ? { ...ws, tasks: ws.tasks.map(task => task.id === taskId ? { ...task, status: 'error', error: errorMessage } : task) } : ws ));
    }
  }, [activeWorkspaceId, workspaces, currentUiState, consoleLogs]);

  const handleCreateTask = useCallback(async (userPrompt: string) => {
    if (!userPrompt.trim() || !activeWorkspaceId) return;
    updateCurrentUiState('aiPrompt', '');
    setFixableError(null);
    closeContextMenu();

    let finalPrompt = userPrompt;
    if (selectedElementInfo) finalPrompt = `Context from selected element (selector: "${selectedElementInfo.selector}", text: "${selectedElementInfo.text.substring(0, 100)}..."): \n\n${userPrompt}`;
    if (attachmentContext?.type === 'text') finalPrompt = `Context from attached file "${attachmentContext.name}":\n\n${attachmentContext.data}\n\n---\n\n${finalPrompt}`;

    const taskId = crypto.randomUUID();
    const newTask: AITask = { id: taskId, userPrompt, status: 'running', timestamp: new Date(), type: 'user' };
    setWorkspaces(prev => prev.map(ws => ws.id === activeWorkspaceId ? { ...ws, tasks: [newTask, ...ws.tasks] } : ws));
    
    const imageToSend = attachmentContext?.type === 'image' ? attachmentContext.data : null;
    setAttachmentContext(null);
    setSelectedElementInfo(null);
    iframeRef.current?.contentWindow?.postMessage({ type: 'clear-selection' }, '*');
    
    await runAIGeneration(finalPrompt, imageToSend, taskId);
  }, [activeWorkspaceId, workspaces, updateCurrentUiState, closeContextMenu, currentUiState, consoleLogs, selectedElementInfo, attachmentContext, runAIGeneration]);

  const handleApproveBlueprint = useCallback(async (taskId: string) => {
    if (!activeWorkspaceId) return;
    const currentWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
    const task = currentWorkspace?.tasks.find(t => t.id === taskId);
    if (!task || !task.assistantResponse?.blueprint) return;

    setWorkspaces(prev => prev.map(ws => ws.id === activeWorkspaceId ? { ...ws, tasks: ws.tasks.map(t => t.id === taskId ? { ...t, status: 'running' } : t) } : ws));

    const implementationPrompt = `The user has approved this application blueprint. Your task is to implement it fully. Generate all necessary files and code based on this plan. Here is the blueprint:\n\n${JSON.stringify(task.assistantResponse.blueprint, null, 2)}`;
    await runAIGeneration(implementationPrompt, null, taskId);
  }, [activeWorkspaceId, workspaces, runAIGeneration]);

  const handleAutoPilotTick = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const currentWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
    if (!currentWorkspace || currentWorkspace.tasks.some(t => t.type === 'autopilot' && t.status === 'running')) return;

    const taskId = crypto.randomUUID();
    const newTask: AITask = { id: taskId, userPrompt: 'Proactive AI Step', status: 'running', timestamp: new Date(), type: 'autopilot' };
    setWorkspaces(prev => prev.map(ws => ws.id === activeWorkspaceId ? { ...ws, tasks: [newTask, ...ws.tasks] } : ws));
    
    await runAIGeneration('Proactive AI Step: Analyze the context and perform the most logical improvement.', null, taskId, true);
  }, [activeWorkspaceId, workspaces, runAIGeneration]);
  
  const autoPilotRunningTask = useMemo(() => activeWorkspace?.tasks.find(t => t.type === 'autopilot' && t.status === 'running'), [activeWorkspace?.tasks]);

  useEffect(() => {
    if (!currentUiState.isAutoPilotOn || !activeWorkspaceId || !!autoPilotRunningTask) return;
    const intervalId = setInterval(() => { handleAutoPilotTick(); }, 10000);
    return () => clearInterval(intervalId);
  }, [currentUiState.isAutoPilotOn, activeWorkspaceId, autoPilotRunningTask, handleAutoPilotTick]);

  const handleApproveTask = useCallback((taskId: string) => {
    if (!activeWorkspaceId) return;
    setWorkspaces(prev => prev.map(ws => {
      if (ws.id !== activeWorkspaceId) return ws;
      const task = ws.tasks.find(t => t.id === taskId);
      if (!task || task.status !== 'pending_confirmation' || !task.assistantResponse?.operations) return ws;
      const newFileSystem = applyFileOperations(ws.fileSystem, task.assistantResponse.operations);
      const updatedTasks = ws.tasks.map((t): AITask => t.id === taskId ? { ...t, status: 'completed' } : t);
      return { ...ws, fileSystem: newFileSystem, tasks: updatedTasks };
    }));
  }, [activeWorkspaceId]);

  const handleRejectTask = useCallback((taskId: string) => {
    if (!activeWorkspaceId) return;
    setWorkspaces(prev => prev.map(ws => ws.id === activeWorkspaceId ? { ...ws, tasks: ws.tasks.map((t): AITask => t.id === taskId ? { ...t, status: 'completed' } : t) } : ws));
  }, [activeWorkspaceId]);

  const handleAutoFix = useCallback((error: LogMessage) => handleCreateTask(`My application has an error. Here is the console output:\n---\n${error.message}\n---\nPlease analyze the current code and fix this error.`), [handleCreateTask]);
  const handleCreateWorkspace = useCallback(() => setInputModalState({ isOpen: true, title: "Create New Workspace", label: "Enter a name for the new workspace:", initialValue: `Project ${workspaces.length + 1}`, confirmText: 'Create Workspace', onConfirm: (name) => { if (name?.trim()) { const newWorkspace: Workspace = { id: crypto.randomUUID(), name, fileSystem: INITIAL_FILES, tasks: [], createdAt: new Date().toISOString() }; setWorkspaces(prev => [...prev, newWorkspace]); setWorkspaceUiStates(prev => ({ ...prev, [newWorkspace.id]: DEFAULT_UI_STATE })); setActiveWorkspaceId(newWorkspace.id); } }, }), [workspaces.length]);
  const handleDeleteWorkspace = useCallback((id: string) => { if (workspaces.length <= 1) { alert("You cannot delete the last workspace."); return; } if (!confirm("Are you sure you want to delete this workspace? This cannot be undone.")) return; const newWorkspaces = workspaces.filter(ws => ws.id !== id); const newActiveId = (activeWorkspaceId === id) ? (newWorkspaces[0]?.id ?? null) : activeWorkspaceId; setWorkspaceUiStates(prev => { const newStates = {...prev}; delete newStates[id]; return newStates; }); setWorkspaces(newWorkspaces); setActiveWorkspaceId(newActiveId); }, [workspaces, activeWorkspaceId]);
  const handleSwitchWorkspace = useCallback((id: string) => setActiveWorkspaceId(id), []);
  const handleFileSelect = useCallback((path: string) => { updateCurrentUiState('activeEditorPath', path); updateCurrentUiState('activeOverlay', null); }, [updateCurrentUiState]);
  const handleCloseEditor = useCallback(() => updateCurrentUiState('activeEditorPath', null), [updateCurrentUiState]);
  const handleFileContentChange = useCallback((path: string, content: string) => { if (!activeWorkspaceId) return; setWorkspaces(prev => prev.map(ws => ws.id === activeWorkspaceId ? { ...ws, fileSystem: updateFileContent(ws.fileSystem, path, content) } : ws)); }, [activeWorkspaceId]);
  const handleToggleFullscreen = useCallback(() => { const newIsFullscreen = !currentUiState.isPreviewFullscreen; updateCurrentUiState('isPreviewFullscreen', newIsFullscreen); if (newIsFullscreen) updateCurrentUiState('activeEditorPath', null); }, [currentUiState.isPreviewFullscreen, updateCurrentUiState]);
  const handleElementSelected = useCallback((info: SelectedElement) => { setSelectedElementInfo(info); setAttachmentContext(null); }, []);
  const handleTakeScreenshot = useCallback(async () => { const iframe = iframeRef.current; if (!iframe?.contentWindow?.document.body) { alert("Could not take screenshot. Preview may not have loaded."); return; } await new Promise(resolve => setTimeout(resolve, 200)); try { const canvas = await html2canvas(iframe.contentWindow.document.body, { useCORS: true, allowTaint: true, backgroundColor: '#ffffff', window: iframe.contentWindow, logging: false } as any); setScreenshotDataUrl(canvas.toDataURL('image/jpeg', 0.9)); setIsAnnotationModalOpen(true); } catch (error) { console.error("Error taking screenshot:", error); alert(`Could not take screenshot. Error: ${error instanceof Error ? error.message : String(error)}`); } }, []);
  const handleClearContext = useCallback(() => { setSelectedElementInfo(null); setAttachmentContext(null); iframeRef.current?.contentWindow?.postMessage({ type: 'clear-selection' }, '*'); }, []);
  const handleFileContextUpload = useCallback((file: File) => { const reader = new FileReader(); reader.onload = (e) => { const data = e.target?.result as string; setAttachmentContext(file.type.startsWith('image/') ? { type: 'image', name: file.name, data } : { type: 'text', name: file.name, data }); }; if (file.type.startsWith('image/')) reader.readAsDataURL(file); else reader.readAsText(file); }, []);
  const previewCode = useMemo(() => { if (!activeWorkspace) return "// No active workspace"; const appFileNode = findNodeByPath('src/App.tsx', activeWorkspace.fileSystem); return (appFileNode && appFileNode.type === 'file') ? appFileNode.content : "// App.tsx not found in src folder."; }, [activeWorkspace]);
  const sidebarItems = [ { panelId: 'workspaces' as const, label: 'Workspaces', icon: <WorkspaceIcon className="w-6 h-6" /> }, { panelId: 'files' as const, label: 'File Explorer', icon: <FileExplorerIcon className="w-6 h-6" /> }, { panelId: 'ai' as const, label: 'AI Assistant', icon: <AIAssistantIcon className="w-6 h-6" /> }, { panelId: 'extensions' as const, label: 'Extensions', icon: <ExtensionsIcon className="w-6 h-6" /> } ];
  const runningTasksCount = useMemo(() => activeWorkspace?.tasks.filter(t => t.status === 'running').length || 0, [activeWorkspace]);
  
  if (!activeWorkspace) return <div className="bg-[#181818] h-screen flex justify-center items-center"><LoaderIcon className="w-12 h-12 animate-spin text-blue-400" /></div>;
  
  const { activeEditorPath, isPreviewFullscreen } = currentUiState;
  const activeFileNode = activeEditorPath ? findNodeByPath(activeEditorPath, activeWorkspace.fileSystem) : null;

  return (
    <div className="bg-[#181818] text-gray-200 min-h-screen flex flex-col h-screen overflow-hidden" onClick={closeContextMenu}>
      {codePreview && <CodePreviewModal {...codePreview} onClose={() => setCodePreview(null)} />}
      <InputModal {...inputModalState} onClose={closeInputModal} />
      {isAnnotationModalOpen && screenshotDataUrl && <AnnotationModal isOpen={isAnnotationModalOpen} screenshotDataUrl={screenshotDataUrl} onClose={() => setIsAnnotationModalOpen(false)} onConfirm={(imageData) => { setAttachmentContext({ type: 'image', name: 'annotated-screenshot.jpeg', data: imageData }); setSelectedElementInfo(null); setIsAnnotationModalOpen(false); }} />}

      <header className="flex items-center p-2.5 border-b border-gray-700 bg-[#1E1E1E] z-20 shrink-0">
        <QuantumCodeLogo className="h-7 w-7 mr-3 text-blue-400" />
        <h1 className="text-lg font-bold tracking-wider">Quantum Code</h1>
        <span className="mx-2 text-gray-500">/</span>
        <span className="text-md font-medium text-gray-300">{activeWorkspace.name}</span>
      </header>
      <div className="flex-grow flex overflow-hidden">
        {!isPreviewFullscreen && ( <>
          <Sidebar activePanel={currentUiState.activeOverlay} onPanelChange={(panelId) => { if (panelId !== 'ai') updateCurrentUiState('activeOverlay', currentUiState.activeOverlay === panelId ? null : panelId); }} items={sidebarItems} />
          <OverlayPanel isOpen={currentUiState.activeOverlay === 'workspaces'} onClose={() => updateCurrentUiState('activeOverlay', null)}><WorkspacesPanel workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} onSwitchWorkspace={handleSwitchWorkspace} onCreateWorkspace={handleCreateWorkspace} onDeleteWorkspace={handleDeleteWorkspace} /></OverlayPanel>
          <OverlayPanel isOpen={currentUiState.activeOverlay === 'files'} onClose={() => updateCurrentUiState('activeOverlay', null)}><FileExplorer fileSystem={activeWorkspace.fileSystem} setContextMenu={setContextMenu} onAiTaskRequest={handleCreateTask} onDirectFileOps={handleDirectFileOperations} onFileSelect={handleFileSelect} activeFilePath={activeEditorPath} onFileUpload={handleFileUpload} onNewFileRequest={handleRequestNewFile} onNewFolderRequest={handleRequestNewFolder} /></OverlayPanel>
          <OverlayPanel isOpen={currentUiState.activeOverlay === 'extensions'} onClose={() => updateCurrentUiState('activeOverlay', null)}><ExtensionsPanel onExtensionChange={() => setInstalledExtensions(getInstalledExtensions())} /></OverlayPanel>
        </>)}
        
        {contextMenu && <ContextMenu {...contextMenu} onClose={closeContextMenu} />}

        <main className="flex-grow flex flex-row overflow-hidden">
          <div className={`${isPreviewFullscreen ? 'w-full' : 'w-3/5'} flex flex-col ${!isPreviewFullscreen && 'border-r-2 border-gray-700'}`}>
            {activeEditorPath && !isPreviewFullscreen && activeFileNode?.type === 'file' ? (
              <CodeEditor path={activeEditorPath} content={activeFileNode.content} onContentChange={(newContent) => handleFileContentChange(activeEditorPath, newContent)} onClose={handleCloseEditor} />
            ) : (
              <WebsitePreview ref={iframeRef} code={previewCode} fixableError={fixableError} onConsoleLog={(log: LogMessage) => { setConsoleLogs(prev => [log, ...prev].slice(0, 50)); if (log.level === 'error' && !fixableError) setFixableError(log); }} onAutoFix={handleAutoFix} isFullscreen={isPreviewFullscreen} onToggleFullscreen={handleToggleFullscreen} activeTab={currentUiState.previewTab} onTabChange={(tab) => updateCurrentUiState('previewTab', tab)} onElementSelected={handleElementSelected} onScreenshot={handleTakeScreenshot} />
            )}
          </div>
          {!isPreviewFullscreen && (
            <div className="w-2/5 flex flex-col">
              <AIPanel 
                tasks={activeWorkspace.tasks}
                onSendMessage={handleCreateTask}
                isLoading={runningTasksCount > 0}
                prompt={currentUiState.aiPrompt}
                onPromptChange={(prompt) => updateCurrentUiState('aiPrompt', prompt)}
                onApproveTask={handleApproveTask}
                onRejectTask={handleRejectTask}
                onApproveBlueprint={handleApproveBlueprint}
                isAutoPilotOn={currentUiState.isAutoPilotOn}
                onToggleAutoPilot={() => updateCurrentUiState('isAutoPilotOn', !currentUiState.isAutoPilotOn)}
                elementContext={selectedElementInfo}
                attachmentContext={attachmentContext}
                onClearContext={handleClearContext}
                onFileUploadForContext={handleFileContextUpload}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;