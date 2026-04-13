import React from 'react';

// ScholarFlow Logo Component - designed to be the title/logo
export const ScholarFlowLogo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const sizeMap = { sm: 24, md: 32, lg: 48 };
  const s = sizeMap[size];

  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Book/Document spine */}
      <path
        d="M12 8C10.9 8 10 8.9 10 10V38C10 39.1 10.9 40 12 40H36C37.1 40 38 39.1 38 38V10C38 8.9 37.1 8 36 8H12Z"
        fill="url(#grad)"
        stroke="#6366f1"
        strokeWidth="1"
      />

      {/* Book lines - research layers */}
      <line x1="16" y1="15" x2="32" y2="15" stroke="white" strokeWidth="1.5" />
      <line x1="16" y1="22" x2="32" y2="22" stroke="white" strokeWidth="1.5" opacity="0.8" />
      <line x1="16" y1="29" x2="32" y2="29" stroke="white" strokeWidth="1.5" opacity="0.6" />

      {/* Magnifying glass (research symbol) in corner */}
      <circle cx="35" cy="13" r="3" stroke="white" strokeWidth="1" fill="none" />
      <line x1="37.5" y1="15.5" x2="39" y2="17" stroke="white" strokeWidth="1" />

      {/* Gradient definition */}
      <defs>
        <linearGradient id="grad" x1="10" y1="8" x2="38" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
    </svg>
  );
};

export default ScholarFlowLogo;
