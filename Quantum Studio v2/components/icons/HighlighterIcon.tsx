import React from 'react';

export const HighlighterIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 19.5a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 15l-3.359-3.359" opacity="0.5" />
        <path strokeLinecap="round" d="M19.5 13.5L13.5 19.5" stroke="currentColor" strokeLinejoin="round" opacity="0.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5L10.5 16.5" opacity="0.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 21.75l1.5-1.5" />
    </svg>
);