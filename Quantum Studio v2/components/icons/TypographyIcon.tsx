import React from 'react';

export const TypographyIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M12 17.25h.008v.008H12v-.008z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75V17.25M17.25 6.75V17.25" />
  </svg>
);
