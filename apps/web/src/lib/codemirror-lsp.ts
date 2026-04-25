'use client';

import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import {
  LSPClient,
  LSPPlugin,
  Workspace,
  languageServerExtensions,
  type Transport,
  type WorkspaceFile,
} from '@codemirror/lsp-client';
import { lspWsApi, type LspChannelMessageEvent } from '@/api/ws-api';
import { useEditorStore } from '@/hooks/use-editor-store';
import { useWebSocketStore } from '@/hooks/use-websocket';

type ManagedWorkspaceFile = WorkspaceFile & {
  views: Set<EditorView>;
};

type RuntimeClientEntry = {
  channelId: string;
  client: LSPClient;
  transport: WsLspTransport;
  refCount: number;
};

const runtimeClients = new Map<string, RuntimeClientEntry>();
const pendingRuntimeClients = new Map<string, Promise<RuntimeClientEntry>>();
const LSP_REQUEST_TIMEOUT_MS = 30_000;

class WsLspTransport implements Transport {
  private readonly handlers = new Set<(value: string) => void>();
  private readonly unsubscribeFromWs: () => void;

  constructor(private readonly channelId: string) {
    this.unsubscribeFromWs = useWebSocketStore
      .getState()
      .onEvent('lsp_channel_message', (payload) => {
        const event = payload as LspChannelMessageEvent;
        if (event.channel_id !== this.channelId) return;
        for (const handler of this.handlers) {
          handler(event.message);
        }
      });
  }

  send(message: string): void {
    void lspWsApi.sendChannelMessage(this.channelId, message);
  }

  subscribe(handler: (value: string) => void): void {
    this.handlers.add(handler);
  }

  unsubscribe(handler: (value: string) => void): void {
    this.handlers.delete(handler);
  }

  dispose() {
    this.unsubscribeFromWs();
    this.handlers.clear();
  }
}

class AtmosLspWorkspace extends Workspace {
  files: WorkspaceFile[] = [];
  private readonly fileMap = new Map<string, ManagedWorkspaceFile>();

  private syncFilesArray() {
    this.files = Array.from(this.fileMap.values());
  }

  override syncFiles() {
    const updates = [];

    for (const file of this.fileMap.values()) {
      const view = file.getView();
      if (!view) continue;

      const plugin = LSPPlugin.get(view);
      if (!plugin || plugin.unsyncedChanges.empty) continue;

      const prevDoc = file.doc;
      const changes = plugin.unsyncedChanges;
      file.version += 1;
      file.doc = view.state.doc;
      plugin.clear();
      updates.push({ file, prevDoc, changes });
    }

    return updates;
  }

  override openFile(uri: string, languageId: string, view: EditorView): void {
    const existing = this.fileMap.get(uri);
    if (existing) {
      existing.views.add(view);
      existing.languageId = languageId;
      existing.doc = view.state.doc;
      this.syncFilesArray();
      return;
    }

    const file: ManagedWorkspaceFile = {
      uri,
      languageId,
      version: 1,
      doc: view.state.doc,
      views: new Set([view]),
      getView: (main?: EditorView) => {
        if (main && file.views.has(main)) return main;
        return file.views.values().next().value ?? null;
      },
    };

    this.fileMap.set(uri, file);
    this.syncFilesArray();
    this.client.didOpen(file);
  }

  override closeFile(uri: string, view: EditorView): void {
    const file = this.fileMap.get(uri);
    if (!file) return;

    file.views.delete(view);
    if (file.views.size > 0) {
      this.syncFilesArray();
      return;
    }

    this.fileMap.delete(uri);
    this.syncFilesArray();
    this.client.didClose(uri);
  }

  override async requestFile(uri: string): Promise<WorkspaceFile | null> {
    const existing = this.getFile(uri);
    if (existing) return existing;
    await this.displayFile(uri);
    return this.getFile(uri);
  }

  override async displayFile(uri: string): Promise<EditorView | null> {
    const current = this.getFile(uri)?.getView();
    if (current) return current;

    const path = fileUriToPath(uri);
    const store = useEditorStore.getState();
    await store.openFile(path, store.currentWorkspaceId ?? undefined);

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const view = this.getFile(uri)?.getView();
      if (view) return view;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return null;
  }
}

async function getOrCreateRuntimeClient(
  channelId: string,
  workspaceRoot: string,
): Promise<RuntimeClientEntry> {
  const existing = runtimeClients.get(channelId);
  if (existing) {
    existing.refCount += 1;
    return existing;
  }

  const pending = pendingRuntimeClients.get(channelId);
  if (pending) {
    const entry = await pending;
    entry.refCount += 1;
    return entry;
  }

  const createEntry = (async () => {
    const transport = new WsLspTransport(channelId);
    const client = new LSPClient({
      rootUri: filePathToUri(workspaceRoot),
      timeout: LSP_REQUEST_TIMEOUT_MS,
      workspace: (clientInstance) => new AtmosLspWorkspace(clientInstance),
      extensions: languageServerExtensions(),
      unhandledNotification: (_client, method, params) => {
        console.debug('[lsp] unhandled notification', method, params);
      },
    });

    try {
      client.connect(transport);
      await client.initializing;

      const entry: RuntimeClientEntry = {
        channelId,
        client,
        transport,
        refCount: 0,
      };

      runtimeClients.set(channelId, entry);
      return entry;
    } catch (error) {
      client.disconnect();
      transport.dispose();
      throw error;
    } finally {
      pendingRuntimeClients.delete(channelId);
    }
  })();

  pendingRuntimeClients.set(channelId, createEntry);
  const entry = await createEntry;
  entry.refCount += 1;
  return entry;
}

export async function acquireCodeMirrorLspExtension(params: {
  channelId: string;
  workspaceRoot: string;
  filePath: string;
  languageId: string;
}): Promise<{ extension: Extension; release: () => Promise<void> }> {
  const entry = await getOrCreateRuntimeClient(params.channelId, params.workspaceRoot);
  const extension = entry.client.plugin(filePathToUri(params.filePath), params.languageId);

  return {
    extension,
    release: async () => {
      const current = runtimeClients.get(params.channelId);
      if (!current) return;

      current.refCount -= 1;
      if (current.refCount > 0) return;

      runtimeClients.delete(params.channelId);
      current.client.disconnect();
      current.transport.dispose();
      await lspWsApi.disconnectChannel(params.channelId).catch(() => {});
    },
  };
}

export async function resetCodeMirrorLspChannel(channelId: string): Promise<void> {
  const entry = runtimeClients.get(channelId);
  if (!entry) {
    await lspWsApi.disconnectChannel(channelId).catch(() => {});
    return;
  }

  runtimeClients.delete(channelId);
  entry.client.disconnect();
  entry.transport.dispose();
  await lspWsApi.disconnectChannel(channelId).catch(() => {});
}

export function lspLanguageId(language: string): string {
  switch (language) {
    case 'tsx':
      return 'typescriptreact';
    case 'jsx':
      return 'javascriptreact';
    case 'typescript':
    case 'javascript':
    case 'rust':
    case 'python':
    case 'go':
    case 'java':
    case 'kotlin':
    case 'swift':
    case 'lua':
    case 'yaml':
    case 'toml':
    case 'c':
    case 'cpp':
      return language;
    case 'shell':
      return 'shellscript';
    default:
      return language;
  }
}

function filePathToUri(path: string): string {
  if (/^[a-zA-Z]:[\\/]/.test(path)) {
    const normalized = path.replace(/\\/g, '/');
    return `file:///${encodePath(normalized)}`;
  }

  return `file://${encodePath(path)}`;
}

function fileUriToPath(uri: string): string {
  const url = new URL(uri);
  const decodedPath = decodeURIComponent(url.pathname);

  if (/^\/[a-zA-Z]:/.test(decodedPath)) {
    return decodedPath.slice(1);
  }

  return decodedPath;
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}
