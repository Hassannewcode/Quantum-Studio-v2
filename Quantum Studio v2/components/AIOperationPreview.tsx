import React from 'react';
import type { FileOperation } from '../types';
import { LoaderIcon } from './icons/LoaderIcon';
import { CheckCircleIcon } from './icons/CheckCircleIcon';
import { QuestionMarkCircleIcon } from './icons/QuestionMarkCircleIcon';
import { FileIcon } from './icons/FileIcon';

const getFileIcon = (fileName: string) => {
    if (fileName.endsWith('.tsx') || fileName.endsWith('.jsx')) {
        return <FileIcon className="text-cyan-400 h-4 w-4 shrink-0 inline-block mr-2" />;
    }
    if (fileName.endsWith('.js') || fileName.endsWith('.ts')) {
        return <FileIcon className="text-yellow-400 h-4 w-4 shrink-0 inline-block mr-2" />;
    }
    if (fileName.endsWith('.json')) {
        return <FileIcon className="text-orange-400 h-4 w-4 shrink-0 inline-block mr-2" />;
    }
    if (fileName.endsWith('.css') || fileName.endsWith('.scss')) {
        return <FileIcon className="text-blue-400 h-4 w-4 shrink-0 inline-block mr-2" />;
    }
    return <FileIcon className="text-gray-400 h-4 w-4 shrink-0 inline-block mr-2" />;
};


const FileChangePreview: React.FC<{ operation: FileOperation }> = ({ operation }) => {
    const lines = (operation.content || '').split('\n');
    // For now, we treat all lines in a create/update op as additions.
    const diffLines = lines.map(line => ({ type: 'add', content: line }));

    return (
        <div className="bg-[#2a2d33] border border-gray-700 rounded-lg overflow-hidden">
            <div className="p-3 border-b border-gray-700 bg-[#34373d]">
                <p className="font-mono text-sm text-blue-300 truncate" title={operation.path}>
                    {getFileIcon(operation.path)}
                    {operation.path}
                </p>
                {operation.description && (
                    <p className="text-sm text-gray-300 mt-1.5">{operation.description}</p>
                )}
            </div>
            <div className="max-h-[300px] overflow-auto text-sm font-mono">
                <table className="w-full text-left">
                    <tbody>
                        {diffLines.map((line, index) => (
                            <tr key={index} className="bg-green-800/20">
                                <td className="w-10 px-2 text-right text-gray-500 select-none">{index + 1}</td>
                                <td className="w-4 px-1 text-center text-green-400 select-none">+</td>
                                <td className="pr-4 py-0.5"><code className="text-gray-200 whitespace-pre-wrap">{line.content || ' '}</code></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


interface AIOperationPreviewProps {
    operations: FileOperation[];
    status: 'processing' | 'confirmed' | 'pending';
    onApprove?: () => void;
    onReject?: () => void;
}

const statusConfig = {
    pending: {
        icon: <QuestionMarkCircleIcon className="h-5 w-5 text-yellow-400" />,
        title: 'Pending file changes',
    },
    processing: {
        icon: <LoaderIcon className="h-5 w-5 animate-spin text-blue-400" />,
        title: 'Applying changes...',
    },
    confirmed: {
        icon: <CheckCircleIcon className="h-5 w-5 text-green-400" />,
        title: 'Changes Applied',
    }
};

export const AIOperationPreview: React.FC<AIOperationPreviewProps> = ({ operations, status, onApprove, onReject }) => {
    const { icon, title } = statusConfig[status];

    const validOps = operations.filter(op => op && op.operation && op.path);
    const fileChangeOps = validOps.filter(op => op.operation === 'CREATE_FILE' || op.operation === 'UPDATE_FILE');
    const otherOps = validOps.filter(op => op.operation !== 'CREATE_FILE' && op.operation !== 'UPDATE_FILE');

    return (
        <div className="mt-3 bg-gray-800 rounded-lg border border-gray-600">
             <div className="p-3">
                <div className="flex items-center gap-2 mb-3">
                    {icon}
                    <h4 className="font-semibold text-gray-200">{title}</h4>
                </div>
                
                <div className="space-y-3">
                    {fileChangeOps.map((op, index) => (
                        <FileChangePreview key={index} operation={op} />
                    ))}
                    
                    {otherOps.length > 0 && (
                        <div>
                            <ul className="space-y-1 text-sm">
                                {otherOps.map((op, index) => (
                                    <li key={index} className="font-mono text-gray-400">
                                        {op.operation.startsWith('RENAME')
                                            ? `Rename ${op.path} to ${op.newPath}`
                                            : `${op.operation.replace('_', ' ')}: ${op.path}`
                                        }
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

            {status === 'pending' && (
                <div className="flex items-center justify-end gap-3 p-3 border-t border-gray-700 bg-gray-800/50">
                    <button 
                        onClick={onReject}
                        className="px-4 py-1.5 text-sm font-semibold rounded-md transition-colors bg-gray-600 hover:bg-gray-500 text-white"
                    >
                        Reject
                    </button>
                     <button 
                        onClick={onApprove}
                        className="px-4 py-1.5 text-sm font-semibold rounded-md transition-colors bg-green-600 hover:bg-green-500 text-white"
                    >
                        Approve Changes
                    </button>
                </div>
            )}
        </div>
    );
};