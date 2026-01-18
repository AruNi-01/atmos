"use client";

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Plus, GitBranch, Folder, File, Briefcase, Layers } from 'lucide-react';
import { FileNode, Project, Workspace } from '@/types/types';
import { MOCK_FILE_TREE } from '@/constants';
import { cn } from "@/lib/utils";

interface LeftSidebarProps {
    projects: Project[];
    workspaces?: Workspace[]; // Deprecated in favor of project.workspaces
}

const LeftSidebar: React.FC<LeftSidebarProps> = ({ projects }) => {
    const [activeTab, setActiveTab] = useState<'projects' | 'files'>('projects');
    const [expandedProjects, setExpandedProjects] = useState<string[]>(['p1']);
    const [expandedFolders, setExpandedFolders] = useState<string[]>(['root', 'src', 'components']);

    const toggleProject = (id: string) => {
        setExpandedProjects(prev =>
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        );
    };

    const toggleFolder = (id: string) => {
        setExpandedFolders(prev =>
            prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
        );
    };

    const renderFileTree = (nodes: FileNode[], level = 0) => {
        return nodes.map(node => {
            const isFolder = node.type === 'folder';
            const isExpanded = expandedFolders.includes(node.id);

            return (
                <div key={node.id}>
                    <div
                        className="flex items-center px-2 py-1 hover:bg-zinc-800/50 cursor-pointer text-zinc-400 hover:text-zinc-200 transition-colors ease-out duration-200"
                        style={{ paddingLeft: `${level * 12 + 8}px` }}
                        onClick={() => isFolder && toggleFolder(node.id)}
                    >
                        {isFolder && (
                            isExpanded ?
                                <ChevronDown className="size-3.5 mr-1.5 opacity-60" /> :
                                <ChevronRight className="size-3.5 mr-1.5 opacity-60" />
                        )}
                        {!isFolder && <div className="w-3.5 mr-1.5" />} {/* Indent spacer for files */}

                        {isFolder ?
                            <Folder className="size-3.5 mr-2 text-zinc-500" /> :
                            <File className="size-3.5 mr-2 text-zinc-600" />
                        }
                        <span className="text-[13px] truncate text-pretty">{node.name}</span>
                    </div>
                    {isFolder && isExpanded && node.children && (
                        <div>{renderFileTree(node.children, level + 1)}</div>
                    )}
                </div>
            );
        });
    };

    return (
        <aside className="w-[240px] flex-shrink-0 flex flex-col border-r border-white/5 h-full select-none">

            {/* Tabs Header */}
            <div className="h-10 flex items-center px-2 border-b border-white/5 space-x-1">
                <button
                    onClick={() => setActiveTab('projects')}
                    className={cn(
                        "flex-1 flex items-center justify-center space-x-2 py-1.5 rounded-sm text-[12px] font-medium transition-colors ease-out duration-200",
                        activeTab === 'projects' ? 'bg-zinc-800 text-zinc-200 shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
                    )}
                >
                    <Layers className="size-3.5" />
                    <span>Projects</span>
                </button>
                <button
                    onClick={() => setActiveTab('files')}
                    className={cn(
                        "flex-1 flex items-center justify-center space-x-2 py-1.5 rounded-sm text-[12px] font-medium transition-colors ease-out duration-200",
                        activeTab === 'files' ? 'bg-zinc-800 text-zinc-200 shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/30'
                    )}
                >
                    <Folder className="size-3.5" />
                    <span>Files</span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar py-3">

                {/* Projects View */}
                {activeTab === 'projects' && (
                    <div className="space-y-4">
                        {projects.map(project => {
                            const isExpanded = expandedProjects.includes(project.id);
                            return (
                                <div key={project.id} className="group/project">
                                    <div className="flex items-center justify-between px-2 py-1.5 group-hover/project:bg-zinc-800/20 rounded-sm mx-2 mb-1">
                                        <button
                                            onClick={() => toggleProject(project.id)}
                                            className="flex items-center text-zinc-300 hover:text-white transition-colors ease-out duration-200 flex-1 min-w-0"
                                        >
                                            {isExpanded ?
                                                <ChevronDown className="size-3.5 mr-2 opacity-60 flex-shrink-0" /> :
                                                <ChevronRight className="size-3.5 mr-2 opacity-60 flex-shrink-0" />
                                            }
                                            <Briefcase className="size-3.5 mr-2 text-zinc-500 flex-shrink-0" />
                                            <span className="text-[13px] font-medium truncate text-pretty">{project.name}</span>
                                        </button>
                                        <button
                                            aria-label="New Workspace"
                                            className="p-1 opacity-0 group-hover/project:opacity-100 hover:bg-zinc-700 rounded-sm transition-all ease-out duration-200"
                                            title="New Workspace"
                                        >
                                            <Plus className="size-3 text-zinc-400" />
                                        </button>
                                    </div>

                                    {isExpanded && (
                                        <div className="space-y-0.5 px-2">
                                            {project.workspaces.map(ws => (
                                                <div
                                                    key={ws.id}
                                                    className={cn(
                                                        "ml-4 flex items-center px-3 py-1.5 rounded-md cursor-pointer transition-all ease-out duration-200 border border-transparent",
                                                        ws.isActive
                                                            ? 'bg-zinc-800/80 text-blue-400 border-zinc-700/50'
                                                            : 'text-zinc-200 hover:bg-zinc-800/40 hover:text-zinc-300'
                                                    )}
                                                >
                                                    <GitBranch className={cn("size-3.5 mr-2 flex-shrink-0", ws.isActive ? 'text-blue-400' : 'text-zinc-600')} />
                                                    <span className="text-[13px] truncate text-pretty">{ws.name}</span>
                                                    {ws.isActive && <div className="ml-auto size-1.5 rounded-sm-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
                                                </div>
                                            ))}
                                            {project.workspaces.length === 0 && (
                                                <div className="ml-4 px-3 py-1.5 text-[12px] text-zinc-600 italic text-pretty">No workspaces</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Files View */}
                {activeTab === 'files' && (
                    <div className="px-1">
                        {renderFileTree(MOCK_FILE_TREE)}
                    </div>
                )}
            </div>

            {/* Add Button */}
            {activeTab === 'projects' && (
                <div className="p-3 border-t border-white/5">
                    <button className="w-full flex items-center justify-center space-x-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[13px] py-1.5 rounded-sm border border-white/5 transition-colors ease-out duration-200 shadow-sm">
                        <Plus className="size-3.5" />
                        <span>Add Project</span>
                    </button>
                </div>
            )}
        </aside>
    );
};

export default LeftSidebar;