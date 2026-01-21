// VSCode-style file icons mapping based on vscode-great-icons
// Icons are stored in packages/ui/src/assets/fileicons/icons/

import iconsJson from '../assets/fileicons/icons.json';

// Icon definitions from JSON
const iconDefinitions: Record<string, { iconPath: string }> = iconsJson.iconDefinitions;
const fileExtensions: Record<string, string> = iconsJson.fileExtensions;
const folderNames: Record<string, string> = iconsJson.folderNames;
const fileNames: Record<string, string> = iconsJson.fileNames;

// Get icon path for a file based on its name/extension
export function getFileIconName(name: string): string {
  // Check file name exact matches first (e.g., "Dockerfile", ".gitignore")
  const lowerName = name.toLowerCase();
  if (fileNames[lowerName]) {
    return fileNames[lowerName];
  }

  // Check file extension
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() : '';
  if (ext && fileExtensions[ext]) {
    return fileExtensions[ext];
  }

  // Default file icon
  return '_file';
}

// Get icon path for a folder based on its name
export function getFolderIconName(name: string, isOpen: boolean = false): string {
  const lowerName = name.toLowerCase();
  const baseIcon = folderNames[lowerName] || '_fd_default';

  // Return open or closed version
  if (isOpen) {
    return `${baseIcon}-open`;
  }
  return baseIcon;
}

// Get the full icon path for an icon key
export function getIconPath(iconKey: string): string {
  const iconDef = iconDefinitions[iconKey];
  if (iconDef?.iconPath) {
    // Convert relative path to absolute path for the public folder
    return iconDef.iconPath.replace('./icons/', '/icons/');
  }
  return '/icons/file.png';
}

// Icon component props helper
export interface FileIconProps {
  name: string;
  isDir: boolean;
  isOpen?: boolean;
  className?: string;
}

export function getFileIconProps({ name, isDir, isOpen = false, className }: FileIconProps) {
  if (isDir) {
    const iconKey = getFolderIconName(name, isOpen);
    return {
      src: getIconPath(iconKey),
      alt: `Folder: ${name}`,
      className,
    };
  }

  const iconKey = getFileIconName(name);
  return {
    src: getIconPath(iconKey),
    alt: `File: ${name}`,
    className,
  };
}
