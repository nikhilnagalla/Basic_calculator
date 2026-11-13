// The only bridge between the sandboxed renderer and the main process.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  ActivityState,
  ApiKeyId,
  CaptureResult,
  ChatEvent,
  ChatRequest,
  Conversation,
  ConversationSummary,
  DeepPartial,
  ModelInfo,
  OverlayCommand,
  PermissionState,
  PublicSettings,
  Settings,
  TranscribeResult,
  WindowMode
} from '@shared/types'

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  platform: process.platform,

  getSettings: (): Promise<{ settings: PublicSettings; canPersistKeys: boolean; hotkeyErrors: string[] }> =>
    ipcRenderer.invoke(IPC.settingsGet),
  updateSettings: (patch: DeepPartial<Settings>): Promise<PublicSettings> => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  resetSettings: (): Promise<PublicSettings> => ipcRenderer.invoke(IPC.settingsReset),
  setApiKey: (id: ApiKeyId, value: string | null): Promise<PublicSettings> => ipcRenderer.invoke(IPC.apiKeySet, id, value),
  onSettingsChanged: (cb: (s: PublicSettings) => void) => subscribe(IPC.settingsChanged, cb),
  onHotkeyErrors: (cb: (names: string[]) => void) => subscribe(IPC.hotkeyErrors, cb),

  startChat: (req: ChatRequest): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.chatStart, req),
  cancelChat: (requestId: string): Promise<void> => ipcRenderer.invoke(IPC.chatCancel, requestId),
  onChatEvent: (cb: (ev: ChatEvent) => void) => subscribe(IPC.chatEvent, cb),
  listModels: (): Promise<ModelInfo[]> => ipcRenderer.invoke(IPC.modelsList),

  setScreenAccess: (enabled: boolean): Promise<PublicSettings> => ipcRenderer.invoke(IPC.screenSetAccess, enabled),
  captureScreen: (): Promise<CaptureResult> => ipcRenderer.invoke(IPC.screenCapture),

  setMicrophoneEnabled: (enabled: boolean): Promise<PublicSettings> => ipcRenderer.invoke(IPC.micSetEnabled, enabled),
  requestMicrophoneAccess: (): Promise<boolean> => ipcRenderer.invoke(IPC.micRequestAccess),
  transcribe: (wav: ArrayBuffer): Promise<TranscribeResult> => ipcRenderer.invoke(IPC.transcribe, wav),
  testTranscription: (): Promise<{ ok: boolean; text: string }> => ipcRenderer.invoke(IPC.transcriptionTest),

  getPermissions: (): Promise<PermissionState> => ipcRenderer.invoke(IPC.permissionsGet),
  openSystemSettings: (kind: 'microphone' | 'screen'): Promise<void> => ipcRenderer.invoke(IPC.permissionsOpenSystemSettings, kind),

  listHistory: (): Promise<ConversationSummary[]> => ipcRenderer.invoke(IPC.historyList),
  getConversation: (id: string): Promise<Conversation | null> => ipcRenderer.invoke(IPC.historyGet, id),
  saveConversation: (conv: Conversation): Promise<boolean> => ipcRenderer.invoke(IPC.historySave, conv),
  deleteConversation: (id: string): Promise<void> => ipcRenderer.invoke(IPC.historyDelete, id),
  clearHistory: (): Promise<void> => ipcRenderer.invoke(IPC.historyClear),

  stopAll: (): Promise<void> => ipcRenderer.invoke(IPC.stopAll),
  setWindowMode: (mode: WindowMode): Promise<void> => ipcRenderer.invoke(IPC.windowSetMode, mode),
  hideWindow: (): Promise<void> => ipcRenderer.invoke(IPC.windowHide),
  quit: (): Promise<void> => ipcRenderer.invoke(IPC.windowQuit),
  reportActivity: (state: Partial<ActivityState>): Promise<void> => ipcRenderer.invoke(IPC.activityUpdate, state),
  onActivity: (cb: (state: Partial<ActivityState>) => void) => subscribe(IPC.activityUpdate, cb),
  onCommand: (cb: (cmd: OverlayCommand) => void) => subscribe(IPC.overlayCommand, cb),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke(IPC.openExternal, url)
}

export type OpenClueApi = typeof api

contextBridge.exposeInMainWorld('openclue', api)
