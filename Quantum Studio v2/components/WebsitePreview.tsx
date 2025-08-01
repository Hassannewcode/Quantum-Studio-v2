import React, { useMemo, useState, useEffect, useRef, forwardRef } from 'react';
import { ConsoleMessage } from './ConsoleMessage';
import { AutoFixPrompt } from './AutoFixPrompt';
import type { LogMessage, SelectedElement } from '../types';
import { EyeIcon } from './icons/EyeIcon';
import { TerminalIcon } from './icons/TerminalIcon';
import { RefreshIcon } from './icons/RefreshIcon';
import { FullscreenIcon } from './icons/FullscreenIcon';
import { ExitFullscreenIcon } from './icons/ExitFullscreenIcon';
import { SelectToolIcon } from './icons/SelectToolIcon';
import { CameraIcon } from './icons/CameraIcon';


interface WebsitePreviewProps {
    code: string;
    fixableError: LogMessage | null;
    onConsoleLog: (log: LogMessage) => void;
    onAutoFix: (log: LogMessage) => void;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
    activeTab: 'preview' | 'console';
    onTabChange: (tab: 'preview' | 'console') => void;
    onElementSelected: (info: SelectedElement) => void;
    onScreenshot: () => void;
}

export const WebsitePreview = forwardRef<HTMLIFrameElement, WebsitePreviewProps>(({ code, fixableError, onConsoleLog, onAutoFix, isFullscreen, onToggleFullscreen, activeTab, onTabChange, onElementSelected, onScreenshot }, ref) => {
    const [logs, setLogs] = useState<LogMessage[]>([]);
    const [refreshKey, setRefreshKey] = useState(0);
    const [isSelectorActive, setIsSelectorActive] = useState(false);
    const internalRef = useRef<HTMLIFrameElement | null>(null);

    useEffect(() => {
        if (ref) {
            if (typeof ref === 'function') {
                ref(internalRef.current);
            } else {
                ref.current = internalRef.current;
            }
        }
    }, [ref]);

    const handleRefresh = () => {
        setRefreshKey(prev => prev + 1);
        setIsSelectorActive(false);
    };

    const toggleElementSelector = () => {
        const nextState = !isSelectorActive;
        setIsSelectorActive(nextState);
        internalRef.current?.contentWindow?.postMessage({ type: 'toggle-selector', enabled: nextState }, '*');
    };

    const consoleScript = `
        const originalConsole = { ...window.console };
        const serialize = (arg) => {
            if (arg instanceof Error) {
                return \`Error: \${arg.message}\\n\${arg.stack}\`;
            }
            if (typeof arg === 'function') {
                return \`[Function: \${arg.name || 'anonymous'}]\`;
            }
            if (typeof arg === 'undefined') return 'undefined';
            if (arg === null) return 'null';
            if (typeof arg === 'object') {
                try {
                    const seen = new WeakSet();
                    return JSON.stringify(arg, (key, value) => {
                        if (typeof value === 'object' && value !== null) {
                            if (seen.has(value)) return '[Circular]';
                            seen.add(value);
                        }
                        return value;
                    }, 2);
                } catch (e) {
                    return '[Unserializable Object]';
                }
            }
            return String(arg);
        };

        Object.keys(originalConsole).forEach(level => {
            window.console[level] = (...args) => {
                window.parent.postMessage({
                    type: 'console',
                    level: level,
                    message: args.map(serialize).join(' '),
                }, '*');
                originalConsole[level].apply(window.console, args);
            };
        });

        window.addEventListener('error', (event) => {
             window.parent.postMessage({
                type: 'console',
                level: 'error',
                message: \`Uncaught Error: \${event.message} at \${event.filename}:\${event.lineno}\`,
            }, '*');
        });
        window.addEventListener('unhandledrejection', event => {
            window.parent.postMessage({
                type: 'console',
                level: 'error',
                message: \`Unhandled Promise Rejection: \${event.reason}\`,
            }, '*');
        });
    `;

    const selectorScript = `
        let selectorActive = false;
        let transientHighlightedElement = null;
        let permanentHighlightedElement = null;

        const transientHighlightStyle = '2px solid #3b82f6';
        const permanentHighlightStyle = '3px solid #f59e0b';
        
        const getSelector = (el) => {
            if (!el || !(el instanceof Element)) return '';
            let path = [];
            while (el.nodeType === Node.ELEMENT_NODE) {
                let selector = el.nodeName.toLowerCase();
                if (el.id) {
                    selector += '#' + el.id.trim().replace(/ /g, '\\\\ ');
                    path.unshift(selector);
                    break;
                } else {
                    let sib = el, nth = 1;
                    while (sib = sib.previousElementSibling) {
                        if (sib.nodeName.toLowerCase() === selector) nth++;
                    }
                    if (nth !== 1) selector += ":nth-of-type("+nth+")";
                }
                path.unshift(selector);
                el = el.parentNode;
            }
            return path.join(" > ");
        };
        
        const clearHighlights = () => {
            if (transientHighlightedElement) {
                transientHighlightedElement.style.outline = '';
                transientHighlightedElement = null;
            }
             if (permanentHighlightedElement) {
                permanentHighlightedElement.style.outline = '';
                permanentHighlightedElement = null;
            }
        };

        window.addEventListener('message', (event) => {
            if (event.data.type === 'toggle-selector') {
                selectorActive = event.data.enabled;
                document.body.style.cursor = selectorActive ? 'crosshair' : 'default';
                if (!selectorActive) {
                    clearHighlights();
                }
            }
            if (event.data.type === 'clear-selection') {
                if (permanentHighlightedElement) {
                    permanentHighlightedElement.style.outline = '';
                    permanentHighlightedElement = null;
                }
            }
        });

        document.addEventListener('mouseover', (e) => {
            if (!selectorActive || e.target === permanentHighlightedElement) return;
            if (e.target !== transientHighlightedElement) {
                if (transientHighlightedElement) transientHighlightedElement.style.outline = '';
                transientHighlightedElement = e.target;
                transientHighlightedElement.style.outline = transientHighlightStyle;
                transientHighlightedElement.style.outlineOffset = '-2px';
            }
        });

        document.addEventListener('mouseout', (e) => {
            if (!selectorActive || !transientHighlightedElement) return;
            transientHighlightedElement.style.outline = '';
            transientHighlightedElement = null;
        });

        document.addEventListener('click', (e) => {
            if (!selectorActive) return;
            e.preventDefault();
            e.stopPropagation();

            const target = e.target;
            const selector = getSelector(target);
            const textContent = target.textContent || '';
            
            window.parent.postMessage({ type: 'element-selected', selector: selector, text: textContent.trim() }, '*');
            
            clearHighlights();
            permanentHighlightedElement = target;
            permanentHighlightedElement.style.outline = permanentHighlightStyle;
            permanentHighlightedElement.style.outlineOffset = '-3px';
            
            selectorActive = false;
            document.body.style.cursor = 'default';

        }, true);
    `;


    const srcDoc = useMemo(() => {
        const renderScript = `
            try {
                ${code}
                const root = ReactDOM.createRoot(document.getElementById('root'));
                root.render(React.createElement(App));
            } catch (err) {
                console.error(err);
                const errorContainer = document.createElement('div');
                errorContainer.style.backgroundColor = '#fff5f5';
                errorContainer.style.color = '#c53030';
                errorContainer.style.padding = '1rem';
                errorContainer.style.fontFamily = 'monospace';
                errorContainer.style.whiteSpace = 'pre-wrap';
                errorContainer.innerText = 'Render Error: ' + err.message + '\\n' + err.stack;
                document.getElementById('root').innerHTML = ''; // Clear previous content
                document.getElementById('root').appendChild(errorContainer);
            }
        `;
        
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <script src="https://cdn.tailwindcss.com"></script>
                <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
                <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
                <script crossorigin src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
                <style> body { background-color: #ffffff; color: #111827; padding: 0; margin: 0; } </style>
                <script>${consoleScript}</script>
                <script>${selectorScript}</script>
            </head>
            <body>
                <div id="root"></div>
                <script type="text/babel" data-presets="react,typescript">${renderScript}</script>
            </body>
            </html>
        `;
    }, [code]);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.source !== internalRef.current?.contentWindow) return;

            if (event.data && event.data.type === 'console') {
                const { level, message } = event.data;
                const validLevels: LogMessage['level'][] = ['log', 'debug', 'info', 'warn', 'error'];
                const logLevel = validLevels.includes(level) ? level : 'log';
                
                const newLog = { level: logLevel, message, timestamp: new Date() };
                setLogs(prevLogs => [...prevLogs, newLog]);
                onConsoleLog(newLog);

                if (logLevel === 'error' && activeTab !== 'console') {
                    onTabChange('console');
                }
            } else if (event.data && event.data.type === 'element-selected') {
                onElementSelected({ selector: event.data.selector, text: event.data.text });
                setIsSelectorActive(false);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [activeTab, onConsoleLog, onTabChange, onElementSelected]);

    useEffect(() => {
        setLogs([]);
    }, [code, refreshKey]);

    return (
        <div className="bg-[#1E1E1E] flex-grow flex flex-col h-full">
            <div className="p-2 border-b border-gray-700 text-sm text-gray-400 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => onTabChange('preview')}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md ${activeTab === 'preview' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                    >
                        <EyeIcon className="h-4 w-4"/>
                        <span>Live Preview</span>
                    </button>
                     <button
                        onClick={() => onTabChange('console')}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md ${activeTab === 'console' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                    >
                        <TerminalIcon className="h-4 w-4"/>
                        <span>Console</span>
                        {logs.filter(l => l.level === 'error').length > 0 && (
                            <span className="bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                                {logs.filter(l => l.level === 'error').length}
                            </span>
                        )}
                    </button>
                </div>
                 <div className="flex items-center gap-2">
                    <button onClick={toggleElementSelector} title="Select Element" className={`p-1.5 rounded-md ${isSelectorActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}>
                        <SelectToolIcon className="h-5 w-5" />
                    </button>
                    <button onClick={onScreenshot} title="Annotate Screenshot" className="p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white rounded-md">
                        <CameraIcon className="h-5 w-5" />
                    </button>
                    <button onClick={handleRefresh} title="Refresh Preview" className="p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white rounded-md">
                        <RefreshIcon className="h-5 w-5" />
                    </button>
                    <button onClick={onToggleFullscreen} title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"} className="p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white rounded-md">
                        {isFullscreen ? <ExitFullscreenIcon className="h-5 w-5" /> : <FullscreenIcon className="h-5 w-5" />}
                    </button>
                </div>
            </div>
            <div className="flex-grow bg-gray-900">
                {activeTab === 'preview' ? (
                    <iframe
                        ref={internalRef}
                        key={refreshKey}
                        srcDoc={srcDoc}
                        title="Website Preview"
                        className="w-full h-full bg-white"
                        sandbox="allow-scripts allow-same-origin allow-popups"
                    />
                ) : (
                    <div className="console-log">
                        {fixableError && (
                           <AutoFixPrompt error={fixableError} onFix={onAutoFix} />
                        )}
                        {logs.length > 0 ? (
                            logs.map((log, index) => <ConsoleMessage key={index} log={log} />)
                        ) : (
                            <div className="p-4 text-gray-500">Console is empty. Use console.log() in your code to see output here.</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});