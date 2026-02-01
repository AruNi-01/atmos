import { Project, Workspace, FileChange, TerminalLine, FileNode } from './types/types';

export const PROJECTS: Project[] = [
  {
    id: 'p1',
    name: 'Core Infrastructure',
    isOpen: true,
    mainFilePath: '/Users/lurunrun/Projects/core-infrastructure',
    sidebarOrder: 0,
    borderColor: '#3b82f6',
    workspaces: [
      { id: 'w1', name: 'feat/auth-flow', branch: 'feat/auth-flow', isActive: true, status: 'modified', projectId: 'p1', isPinned: false, isArchived: false, createdAt: new Date().toISOString(), localPath: '/Users/lurunrun/Projects/core-infrastructure/.worktrees/feat-auth-flow' },
      { id: 'w2', name: 'hotfix/api-latency', branch: 'hotfix/api-latency', isActive: false, status: 'clean', projectId: 'p1', isPinned: false, isArchived: false, createdAt: new Date().toISOString(), localPath: '/Users/lurunrun/Projects/core-infrastructure/.worktrees/hotfix-api-latency' },
    ],
  },
  {
    id: 'p2',
    name: 'Frontend Clients',
    isOpen: false,
    mainFilePath: '/Users/lurunrun/Projects/frontend-clients',
    sidebarOrder: 1,
    borderColor: '#22c55e',
    workspaces: [
      { id: 'w3', name: 'chore/deps-upgrade', branch: 'chore/deps-upgrade', isActive: false, status: 'clean', projectId: 'p2', isPinned: false, isArchived: false, createdAt: new Date().toISOString(), localPath: '/Users/lurunrun/Projects/frontend-clients/.worktrees/chore-deps-upgrade' },
      { id: 'w4', name: 'feat/new-dashboard', branch: 'feat/new-dashboard', isActive: false, status: 'clean', projectId: 'p2', isPinned: false, isArchived: false, createdAt: new Date().toISOString(), localPath: '/Users/lurunrun/Projects/frontend-clients/.worktrees/feat-new-dashboard' },
    ],
  },
];

export const FILE_CHANGES: FileChange[] = [
  { id: 'f1', path: 'src/components/Header.tsx', additions: 12, deletions: 4, status: 'M' },
  { id: 'f2', path: 'src/utils/auth.ts', additions: 45, deletions: 0, status: 'A' },
  { id: 'f3', path: 'public/assets/logo_old.svg', additions: 0, deletions: 1, status: 'D' },
  { id: 'f4', path: 'tailwind.config.js', additions: 2, deletions: 2, status: 'M' },
];

export const TERMINAL_LOGS: TerminalLine[] = [
  { id: 1, content: '> vibe dev --turbo', type: 'command' },
  { id: 2, content: '[ready] started server on 0.0.0.0:3000, url: http://localhost:3000', type: 'success' },
  { id: 3, content: '[event] hot reload src/components/Header.tsx', type: 'info' },
  { id: 4, content: '[warn] unused variable "User" in src/utils/auth.ts:42', type: 'error' },
];

export const MOCK_CODE = `import React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps {
  variant: 'primary' | 'ghost';
  size?: 'sm' | 'md';
}

export const Button = ({ variant, size = 'md' }: ButtonProps) => {
  return (
    <button
      className={cn(
        "rounded-md transition-all duration-200",
        variant === 'primary' && "bg-blue-500 text-white",
        size === 'sm' ? "px-2 py-1" : "px-4 py-2"
      )}
    >
      Click Me
    </button>
  );
};`;

export const MOCK_FILE_TREE: FileNode[] = [
  {
    id: 'root',
    name: 'atmos',
    type: 'folder',
    isOpen: true,
    children: [
      {
        id: 'src',
        name: 'src',
        type: 'folder',
        isOpen: true,
        children: [
          {
            id: 'components',
            name: 'components',
            type: 'folder',
            isOpen: true,
            children: [
              { id: 'Header.tsx', name: 'Header.tsx', type: 'file' },
              { id: 'Button.tsx', name: 'Button.tsx', type: 'file' },
            ]
          },
          { id: 'App.tsx', name: 'App.tsx', type: 'file' },
          { id: 'types.ts', name: 'types.ts', type: 'file' },
        ]
      },
      { id: 'package.json', name: 'package.json', type: 'file' },
      { id: 'tsconfig.json', name: 'tsconfig.json', type: 'file' },
    ]
  }
];

export const MOCK_DIFF = ` import React from 'react';
 import { cn } from '@/lib/utils';

 interface ButtonProps {
-  variant: 'primary' | 'secondary';
+  variant: 'primary' | 'ghost';
   size?: 'sm' | 'md';
 }

 export const Button = ({ variant, size = 'md' }: ButtonProps) => {
   return (
     <button
       className={cn(
         "rounded-md transition-all duration-200",
-        variant === 'primary' ? "bg-blue-600" : "bg-gray-200",
+        variant === 'primary' && "bg-blue-500 text-white",
         size === 'sm' ? "px-2 py-1" : "px-4 py-2"
       )}
     >
       Click Me
     </button>
   );
 };`;
