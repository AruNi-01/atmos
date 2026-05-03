'use client';

import React, { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { OpenFile } from '@/hooks/use-editor-store';
import {
  Loader2,
  FileWarning,
  Download,
  ZoomIn,
  ZoomOut,
  RotateCw,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn, Button } from '@workspace/ui';
import { getRuntimeApiConfig, httpBase } from '@/lib/desktop-runtime';

// Dynamic import CodeMirror editor to avoid SSR issues
const CodeMirrorEditor = dynamic(() => import('./CodeMirrorEditor'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <span className="sr-only">Loading Editor...</span>
    </div>
  ),
});


interface FileViewerProps {
  file: OpenFile;
  className?: string;
}

const UnsupportedView: React.FC<{ fileName: string; uri: string; ext?: string }> = ({ fileName, uri, ext }) => {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-background p-6 gap-4 text-center select-none">
      <div className="size-20 rounded-full bg-muted flex items-center justify-center">
        <FileWarning className="size-10 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h3 className="font-medium text-lg">Preview not available</h3>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto text-pretty">
          {ext ? `"${ext.toUpperCase()}" files` : "This file"} cannot be previewed directly.
        </p>
      </div>
      <Button variant="outline" size="sm" className="gap-2" asChild>
        <a href={uri} download={fileName} target="_blank" rel="noopener noreferrer">
          <Download className="size-4" />
          Download File
        </a>
      </Button>
    </div>
  );
};



const ImageViewer: React.FC<{ uri: string; fileName: string; onError: () => void }> = ({ uri, fileName, onError }) => {
  const [scale, setScale] = useState(1);
  const [isHovered, setIsHovered] = useState(false);
  const [inputValue, setInputValue] = useState("100%");

  // Update input text when scale changes via buttons
  useEffect(() => {
    setInputValue(`${Math.round(scale * 100)}%`);
  }, [scale]);

  const handleZoomIn = () => setScale(s => Math.min(s + 0.5, 5));
  const handleZoomOut = () => setScale(s => Math.max(s - 0.1, 0.1));
  const handleReset = () => setScale(1);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = parseInt(inputValue.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(val)) {
        // Clamp between 10% and 500%
        const clamped = Math.min(Math.max(val, 10), 500);
        setScale(clamped / 100);
        setInputValue(`${clamped}%`);
        // Blur to show we are done
        e.currentTarget.blur();
      } else {
        // Reset to current scale if invalid
        setInputValue(`${Math.round(scale * 100)}%`);
      }
    }
  };

  const handleInputBlur = () => {
    const val = parseInt(inputValue.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(val)) {
      const clamped = Math.min(Math.max(val, 10), 500);
      setScale(clamped / 100);
      setInputValue(`${clamped}%`);
    } else {
      setInputValue(`${Math.round(scale * 100)}%`);
    }
  };


  return (
    <div className="h-full w-full relative overflow-hidden bg-background group">
      {/* Combined Hover Zone & Controls */}
      <div
        className={cn(
          "absolute top-4 left-0 z-20 flex items-center transition-all duration-300 ease-in-out pl-2",
          isHovered ? "w-auto opacity-100 translate-x-1" : "w-8 opacity-50 translate-x-0"
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className={cn(
          "flex items-center gap-1 p-1 bg-background/80 backdrop-blur rounded-md border shadow-sm transition-all overflow-hidden",
          !isHovered && "w-8 h-6 p-0 justify-center border-dashed"
        )}>
          {isHovered ? (
            <>
              <Button variant="ghost" size="icon" className="size-8 cursor-pointer" onClick={handleZoomOut} title="Zoom Out">
                <ZoomOut className="size-4" />
              </Button>
              <input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                onBlur={handleInputBlur}
                className="w-12 text-center text-xs bg-transparent border-none outline-none font-mono focus:bg-muted/50 rounded"
              />
              <Button variant="ghost" size="icon" className="size-8 cursor-pointer" onClick={handleZoomIn} title="Zoom In">
                <ZoomIn className="size-4" />
              </Button>
              <div className="w-px h-4 bg-border mx-1" />
              <Button variant="ghost" size="icon" className="size-8 cursor-pointer" onClick={handleReset} title="Reset">
                <RotateCw className="size-4" />
              </Button>
            </>
          ) : (
            <ZoomIn className="size-4 text-muted-foreground" />
          )}
        </div>
      </div>
      <div className="h-full w-full overflow-auto flex items-center justify-center p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={uri}
          alt={fileName}
          style={{ transform: `scale(${scale})`, transition: 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)' }}
          className="max-w-full max-h-full object-contain shadow-sm"
          onError={onError}
        />
      </div>
    </div>
  )
}

const NativeFileViewer: React.FC<{ ext: string; uri: string; fileName: string; onError: () => void }> = ({
  ext,
  uri,
  fileName,
  onError
}) => {
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff'].includes(ext);
  const isVideo = ['mp4', 'webm', 'ogg', 'mov'].includes(ext);
  const isAudio = ['mp3', 'wav'].includes(ext);
  const isPdf = ['pdf'].includes(ext);

  if (isImage) {
    return <ImageViewer uri={uri} fileName={fileName} onError={onError} />;
  }

  if (isVideo) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-black/5">
        <video controls className="max-w-full max-h-full" onError={onError}>
          <source src={uri} />
          Your browser does not support the video tag.
        </video>
      </div>
    );
  }

  if (isAudio) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-black/5">
        <audio controls onError={onError}>
          <source src={uri} />
          Your browser does not support the audio tag.
        </audio>
      </div>
    );
  }

  if (isPdf) {
    return (
      <iframe
        src={uri}
        className="w-full h-full border-none"
        title={`Preview of ${fileName}`}
        onError={onError}
      />
    );
  }

  // Fallback for logic mismatch
  return <UnsupportedView fileName={fileName} uri={uri} ext={ext} />;
}

export const FileViewer: React.FC<FileViewerProps> = ({ file, className }) => {
  const { resolvedTheme } = useTheme();
  const [errorFilePath, setErrorFilePath] = useState<string | null>(null);
  const hasError = errorFilePath === file.path;

  // Check if file is binary
  const isStream = file.content.startsWith('stream://');
  const isBase64 = file.content.startsWith('data:') && file.content.includes(';base64,');
  const isBinary = isStream || isBase64;

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const staticDocData = isBinary && !isStream ? { uri: file.content, ext } : null;
  const [streamDocData, setStreamDocData] = useState<{ content: string; uri: string; ext: string } | null>(null);
  const docData = isStream && streamDocData?.content === file.content
    ? { uri: streamDocData.uri, ext: streamDocData.ext }
    : staticDocData;

  useEffect(() => {
    if (!isStream) return;

    const content = file.content;
    const path = content.replace('stream://', '');
    // Build URL pointing to Rust API's file-serving endpoint
    getRuntimeApiConfig().then((cfg) => {
      const base = httpBase(cfg);
      const params = new URLSearchParams({ path });
      if (cfg.token) params.set('token', cfg.token);
      setStreamDocData({ content, uri: `${base}/api/system/file?${params.toString()}`, ext });
    });
  }, [ext, file.content, isStream]);

  if (isBinary && docData) {
    const { uri, ext } = docData;

    // Explicit list of natively supported binary types
    const NATIVE_SUPPORTED = [
      'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff',
      'mp4', 'webm', 'ogg', 'mov', 'mp3', 'wav',
      'pdf'
    ];

    const isSupported = NATIVE_SUPPORTED.includes(ext);

    if (hasError || !isSupported) {
      return <UnsupportedView fileName={file.name} uri={uri} ext={ext} />;
    }

    return (
      <div
        className={cn("h-full w-full overflow-hidden bg-background relative", className)}
        style={{
          backgroundColor: resolvedTheme === 'dark' ? '#09090b' : '#ffffff'
        }}
      >
        <NativeFileViewer
          key={uri} // Remount on file change
          ext={ext}
          uri={uri}
          fileName={file.name}
          onError={() => setErrorFilePath(file.path)}
        />
      </div>
    );
  }

  return <CodeMirrorEditor file={file} className={className} />;
};

export default FileViewer;
