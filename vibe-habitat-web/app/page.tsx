"use client";

import { AppShell } from '@/components/layout/AppShell';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Tabs, TabsList, TabsTab } from '@/components/ui/Tabs';
import { WelcomeScreen } from '@/components/workspace/WelcomeScreen';

const MosaicLayout = dynamic(() => import('@/components/workspace/MosaicLayout').then(mod => mod.MosaicLayout), { ssr: false });

export default function Home() {
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [tabs, setTabs] = useState<{ id: string; title: string; favicon: string }[]>([]);

  const handleQuickStart = () => {
    const newTabId = 'window-demo';
    if (!tabs.find(t => t.id === newTabId)) {
      setTabs(prev => [...prev, { id: newTabId, title: 'Window Demo', favicon: '🪟' }]);
    }
    setActiveTab(newTabId);
  };

  return (
    <AppShell>
      {tabs.length === 0 ? (
        <WelcomeScreen onQuickStart={handleQuickStart} />
      ) : (
        <div className="h-full flex flex-col">
          {/* Top Tabs Area */}
          <div className="h-10 bg-muted/50 flex items-end px-2 border-b border-border">
            <Tabs
              value={activeTab || undefined}
              onValueChange={(val) => setActiveTab(val)}
            >
              <TabsList variant="underline">
                {tabs.map(tab => (
                  <TabsTab key={tab.id} value={tab.id} className="flex items-center gap-2">
                    <span>{tab.favicon}</span>
                    <span>{tab.title}</span>
                  </TabsTab>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="flex-1 relative">
            {activeTab === 'window-demo' ? (
              <MosaicLayout />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                {/* Placeholder for other tabs */}
                Empty Tab
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
