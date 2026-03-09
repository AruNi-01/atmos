'use client';

import { StreamLanguage } from '@codemirror/language';
import type { StreamParser } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

const SPECIAL_FILE_NAMES: Record<string, string> = {
  dockerfile: 'dockerfile',
  gemfile: 'ruby',
  rakefile: 'ruby',
  podfile: 'ruby',
  brewfile: 'ruby',
  'cmakelists.txt': 'cmake',
  makefile: 'shell',
  '.bashrc': 'shell',
  '.bash_profile': 'shell',
  '.zshrc': 'shell',
  '.zprofile': 'shell',
  '.profile': 'shell',
  '.env': 'properties',
  '.env.local': 'properties',
  '.env.development': 'properties',
  '.env.production': 'properties',
  '.env.test': 'properties',
};

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  html: 'html',
  htm: 'html',
  vue: 'html',
  svelte: 'html',
  astro: 'html',
  css: 'css',
  scss: 'css',
  sass: 'css',
  less: 'css',
  pcss: 'css',
  md: 'markdown',
  mdx: 'markdown',
  markdown: 'markdown',
  xml: 'xml',
  xsd: 'xml',
  xsl: 'xml',
  xslt: 'xml',
  svg: 'xml',
  plist: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  ini: 'properties',
  conf: 'properties',
  cfg: 'properties',
  properties: 'properties',
  env: 'properties',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ksh: 'shell',
  ps1: 'powershell',
  psm1: 'powershell',
  psd1: 'powershell',
  py: 'python',
  pyw: 'python',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  sc: 'scala',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  'c++': 'cpp',
  hh: 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',
  cs: 'csharp',
  csx: 'csharp',
  swift: 'swift',
  m: 'objective-c',
  mm: 'objective-cpp',
  dart: 'dart',
  rb: 'ruby',
  gemspec: 'ruby',
  php: 'php',
  phtml: 'php',
  sql: 'sql',
  pl: 'perl',
  pm: 'perl',
  lua: 'lua',
  groovy: 'groovy',
  gradle: 'groovy',
  dockerfile: 'dockerfile',
  cmake: 'cmake',
};

const LANGUAGE_ALIASES: Record<string, string> = {
  plaintext: 'plaintext',
  text: 'plaintext',
  shell: 'shell',
  bash: 'shell',
  sh: 'shell',
  zsh: 'shell',
  yml: 'yaml',
  mdx: 'markdown',
  cjs: 'javascript',
  mjs: 'javascript',
  mts: 'typescript',
  cts: 'typescript',
  cs: 'csharp',
  kt: 'kotlin',
  m: 'objective-c',
  mm: 'objective-cpp',
};

const languageExtensionCache = new Map<string, Promise<Extension>>();
const projectLanguageWarmCache = new Set<string>();

function normalizeLanguage(language?: string): string {
  if (!language) return 'plaintext';
  const normalized = language.toLowerCase().trim();
  return LANGUAGE_ALIASES[normalized] || normalized;
}

export function detectCodeLanguage(filePathOrName: string): string {
  const normalizedPath = filePathOrName.split('?')[0];
  const fileName = normalizedPath.split('/').pop()?.toLowerCase() || normalizedPath.toLowerCase();

  if (SPECIAL_FILE_NAMES[fileName]) {
    return SPECIAL_FILE_NAMES[fileName];
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return EXTENSION_LANGUAGE_MAP[ext] || 'plaintext';
}

export function normalizeCodeLanguage(language?: string): string {
  return normalizeLanguage(language);
}

async function loadLegacyMode<T>(
  importer: () => Promise<T>,
  pickMode: (legacyModule: T) => StreamParser<unknown>
): Promise<Extension> {
  const legacyModule = await importer();
  return StreamLanguage.define(pickMode(legacyModule));
}

const LANGUAGE_LOADERS: Record<string, () => Promise<Extension>> = {
  javascript: async () => (await import('@codemirror/lang-javascript')).javascript(),
  jsx: async () => (await import('@codemirror/lang-javascript')).javascript({ jsx: true }),
  typescript: async () =>
    (await import('@codemirror/lang-javascript')).javascript({ typescript: true }),
  tsx: async () =>
    (await import('@codemirror/lang-javascript')).javascript({ jsx: true, typescript: true }),
  json: async () => (await import('@codemirror/lang-json')).json(),
  html: async () => (await import('@codemirror/lang-html')).html(),
  vue: async () => (await import('@codemirror/lang-vue')).vue(),
  svelte: async () => (await import('@replit/codemirror-lang-svelte')).svelte(),
  css: async () => (await import('@codemirror/lang-css')).css(),
  markdown: async () => (await import('@codemirror/lang-markdown')).markdown(),
  python: async () => (await import('@codemirror/lang-python')).python(),
  go: async () => (await import('@codemirror/lang-go')).go(),
  rust: async () => (await import('@codemirror/lang-rust')).rust(),
  java: async () => (await import('@codemirror/lang-java')).java(),
  c: async () => (await import('@codemirror/lang-cpp')).cpp(),
  cpp: async () => (await import('@codemirror/lang-cpp')).cpp(),
  sql: async () => (await import('@codemirror/lang-sql')).sql(),
  xml: async () => (await import('@codemirror/lang-xml')).xml(),
  yaml: async () => (await import('@codemirror/lang-yaml')).yaml(),
  php: async () => (await import('@codemirror/lang-php')).php(),
  toml: () =>
    loadLegacyMode(
      () => import('@codemirror/legacy-modes/mode/toml'),
      (module) => module.toml
    ),
  shell: () =>
    loadLegacyMode(
      () => import('@codemirror/legacy-modes/mode/shell'),
      (module) => module.shell
    ),
  powershell: () =>
    loadLegacyMode(
      () => import('@codemirror/legacy-modes/mode/powershell'),
      (legacyModule) => legacyModule.powerShell
    ),
  ruby: () =>
    loadLegacyMode(
      () => import('@codemirror/legacy-modes/mode/ruby'),
      (module) => module.ruby
    ),
  perl: () =>
    loadLegacyMode(
      () => import('@codemirror/legacy-modes/mode/perl'),
      (module) => module.perl
    ),
  lua: () =>
    loadLegacyMode(
      () => import('@codemirror/legacy-modes/mode/lua'),
      (module) => module.lua
    ),
  groovy: () =>
    loadLegacyMode(
      () => import('@codemirror/legacy-modes/mode/groovy'),
      (module) => module.groovy
    ),
  swift: () =>
    loadLegacyMode(
      () => import('@codemirror/legacy-modes/mode/swift'),
      (module) => module.swift
    ),
  kotlin: () =>
    loadLegacyMode(
      () => import('@codemirror/legacy-modes/mode/clike'),
      (module) => module.kotlin
    ),
  scala: () =>
    loadLegacyMode(
      () => import('@codemirror/legacy-modes/mode/clike'),
      (module) => module.scala
    ),
  csharp: () =>
    loadLegacyMode(
      () => import('@codemirror/legacy-modes/mode/clike'),
      (module) => module.csharp
    ),
  dart: () =>
    loadLegacyMode(
      () => import('@codemirror/legacy-modes/mode/clike'),
      (module) => module.dart
    ),
  'objective-c': () =>
    loadLegacyMode(
      () => import('@codemirror/legacy-modes/mode/clike'),
      (module) => module.objectiveC
    ),
  'objective-cpp': () =>
    loadLegacyMode(
      () => import('@codemirror/legacy-modes/mode/clike'),
      (module) => module.objectiveCpp
    ),
  dockerfile: () =>
    loadLegacyMode(
      () => import('@codemirror/legacy-modes/mode/dockerfile'),
      (legacyModule) => legacyModule.dockerFile
    ),
  cmake: () =>
    loadLegacyMode(
      () => import('@codemirror/legacy-modes/mode/cmake'),
      (module) => module.cmake
    ),
  properties: () =>
    loadLegacyMode(
      () => import('@codemirror/legacy-modes/mode/properties'),
      (module) => module.properties
    ),
};

export async function loadCodeLanguageSupport(language?: string): Promise<Extension> {
  const normalized = normalizeLanguage(language);

  if (normalized === 'plaintext') {
    return [];
  }

  const loader = LANGUAGE_LOADERS[normalized];
  if (!loader) {
    return [];
  }

  const cached = languageExtensionCache.get(normalized);
  if (cached) {
    return cached;
  }

  const extensionPromise = loader().catch((error) => {
    console.warn(`[CodeMirror] Failed to load language support for "${normalized}"`, error);
    return [] as Extension;
  });

  languageExtensionCache.set(normalized, extensionPromise);
  return extensionPromise;
}

export async function preloadCodeLanguages(languages: string[]): Promise<void> {
  await Promise.all(
    languages
      .map((language) => normalizeLanguage(language))
      .filter((language) => language !== 'plaintext')
      .map((language) => loadCodeLanguageSupport(language))
  );
}

export function markProjectLanguagesPrewarmed(projectPath: string): boolean {
  if (projectLanguageWarmCache.has(projectPath)) {
    return false;
  }

  projectLanguageWarmCache.add(projectPath);
  return true;
}
