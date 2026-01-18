import React from 'react';
import { GitBranch, Activity, Wifi } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="h-6 flex items-center justify-between px-3 backdrop-blur-md border-t border-white/10 text-[10px] font-mono text-zinc-400 select-none shadow-2xl">

      {/* Left Status */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center hover:text-zinc-300 cursor-pointer transition-colors">
          <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></div>
          <span className="font-medium text-zinc-400">NORMAL</span>
        </div>
        <div className="flex items-center space-x-1.5 hover:text-blue-400 cursor-pointer transition-colors">
          <GitBranch className="w-3 h-3" />
          <span>feat/auth-flow</span>
        </div>
        <div className="h-3 w-[1px] bg-zinc-800"></div>
        <div className="flex items-center space-x-1">
          <span>0 errors</span>
          <span className="text-zinc-700">|</span>
          <span>1 warning</span>
        </div>
      </div>

      {/* Right Status */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <Activity className="w-3 h-3 text-emerald-500" />
          <span>agent: idle</span>
        </div>
        <div className="flex items-center space-x-3">
          <span>Ln 42, Col 18</span>
          <span>UTF-8</span>
          <span>TypeScript</span>
        </div>
        <div className="flex items-center text-zinc-600">
          <Wifi className="w-3 h-3" />
        </div>
      </div>
    </footer>
  );
};

export default Footer;