import React from 'react';
import type { AppBlueprint, StyleGuideline } from '../types';
import { StarIcon } from './icons/StarIcon';
import { ColorPaletteIcon } from './icons/ColorPaletteIcon';
import { LayoutIcon } from './icons/LayoutIcon';
import { TypographyIcon } from './icons/TypographyIcon';
import { ShapesIcon } from './icons/ShapesIcon';
import { PlayCircleIcon } from './icons/PlayCircleIcon';
import { BuildIcon } from './icons/BuildIcon';

interface AppBlueprintDisplayProps {
    blueprint: AppBlueprint;
    onApprove: () => void;
}

const styleIconMap: Record<StyleGuideline['category'], React.ReactNode> = {
    Color: <ColorPaletteIcon className="w-5 h-5 text-gray-400" />,
    Layout: <LayoutIcon className="w-5 h-5 text-gray-400" />,
    Typography: <TypographyIcon className="w-5 h-5 text-gray-400" />,
    Iconography: <ShapesIcon className="w-5 h-5 text-gray-400" />,
    Animation: <PlayCircleIcon className="w-5 h-5 text-gray-400" />,
};

export const AppBlueprintDisplay: React.FC<AppBlueprintDisplayProps> = ({ blueprint, onApprove }) => {
    return (
        <div className="bg-gray-800/70 border border-gray-700 rounded-lg overflow-hidden mt-4">
            <div className="p-4 sm:p-6">
                <header className="mb-6">
                    <p className="text-sm font-medium text-blue-400 uppercase tracking-wider">App Blueprint</p>
                    <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1">{blueprint.appName}</h2>
                </header>
                
                <div className="space-y-8">
                    {/* Features */}
                    <div>
                        <h3 className="text-base font-semibold text-gray-300 uppercase tracking-widest border-b border-gray-600 pb-2 mb-4">Features</h3>
                        <ul className="space-y-4">
                            {blueprint.features.map(feature => (
                                <li key={feature.title} className="flex items-start gap-4">
                                    <StarIcon className="w-5 h-5 text-yellow-400 mt-1 shrink-0" />
                                    <div>
                                        <h4 className="font-bold text-white">{feature.title}</h4>
                                        <p className="text-gray-400 text-sm leading-relaxed">{feature.description}</p>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Style Guidelines */}
                    <div>
                         <h3 className="text-base font-semibold text-gray-300 uppercase tracking-widest border-b border-gray-600 pb-2 mb-4">Style Guidelines</h3>
                         <ul className="space-y-5">
                            {blueprint.styleGuidelines.map(style => (
                                <li key={style.category} className="flex items-start gap-4">
                                    <div className="shrink-0">{styleIconMap[style.category]}</div>
                                    <div className="flex-grow">
                                        <h4 className="font-semibold text-gray-200">{style.category}</h4>
                                        <p className="text-gray-400 text-sm leading-relaxed">{style.details}</p>
                                        {style.category === 'Color' && style.colors && (
                                            <div className="flex items-center gap-2 mt-2">
                                                {style.colors.map(color => (
                                                    <div key={color} style={{ backgroundColor: color }} className="w-6 h-6 rounded-full border-2 border-gray-600" title={color}></div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </li>
                            ))}
                         </ul>
                    </div>
                </div>
            </div>
            
            <footer className="bg-gray-900/50 p-4 border-t border-gray-700">
                <button
                    onClick={onApprove}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-500 transition-colors shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500"
                >
                    <BuildIcon className="w-5 h-5" />
                    Prototype this App
                </button>
            </footer>
        </div>
    );
};
