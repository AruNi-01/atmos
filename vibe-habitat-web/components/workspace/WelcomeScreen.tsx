import React from 'react';
import { Folder, Globe, PlusSquare, Box } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WelcomeScreenProps {
  onQuickStart?: () => void;
}

export function WelcomeScreen({ onQuickStart }: WelcomeScreenProps) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-background p-8 animate-in fade-in duration-500">
      <div className="max-w-4xl w-full flex flex-col items-center gap-12">

        {/* Title Section */}
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-4">
            {/* Styled blocky title effect */}
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-foreground select-none">
              VIBEHABITAT
            </h1>
          </div>
          <p className="text-muted-foreground text-lg font-medium tracking-wide">
            VISUAL TERMINAL WORKSPACE
          </p>
        </div>

        {/* Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
          <ActionCard
            icon={<Folder className="w-6 h-6" />}
            label="Open project"
            onClick={() => { }}
          />
          <ActionCard
            icon={<Globe className="w-6 h-6" />}
            label="Clone from URL"
            onClick={() => { }}
          />
          <ActionCard
            icon={<PlusSquare className="w-6 h-6" />}
            label="Quick start"
            onClick={onQuickStart}
          />
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center gap-2 text-muted-foreground/50 text-sm font-mono">
          <Box className="w-4 h-4" />
          <span>v0.1.0-alpha</span>
        </div>

      </div>
    </div>
  );
}

function ActionCard({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex flex-col justify-between p-6 h-48 w-full",
        "bg-card/30 hover:bg-card/50 border border-border/50 hover:border-border",
        "rounded-xl transition-all duration-300 ease-out",
        "text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <div className="text-muted-foreground group-hover:text-foreground transition-colors duration-300">
        {icon}
      </div>
      <span className="text-lg font-medium text-foreground/80 group-hover:text-foreground transition-colors duration-300">
        {label}
      </span>
    </button>
  )
}
