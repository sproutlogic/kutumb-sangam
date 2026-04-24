import React from 'react';

interface AuthShellProps {
  children: React.ReactNode;
  maxWidth?: string;
  theme?: 'plum' | 'saffron';
}

const AuthShell: React.FC<AuthShellProps> = ({ children, maxWidth = 'max-w-md', theme }) => (
  <div className={`min-h-[calc(100vh-4rem)] flex items-center justify-center p-4${theme === 'saffron' ? ' pandit-theme' : ''}`}>
    <div className={`w-full ${maxWidth}`}>{children}</div>
  </div>
);

export default AuthShell;
