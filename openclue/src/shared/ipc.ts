// IPC channel names. Keep in one place so main, preload and renderer agree.
export const IPC = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsReset: 'settings:reset',
  settingsChanged: 'settings:changed',
  apiKeySet: 'api-key:set',

  chatStart: 'chat:start',
  chatCancel: 'chat:cancel',
  chatEvent: 'chat:event',

  modelsList: 'models:list',
  providerTest: 'provider:test',

  screenCapture: 'screen:capture',
  screenSetAccess: 'screen:set-access',

  micSetEnabled: 'mic:set-enabled',
  micRequestAccess: 'mic:request-access',
  transcribe: 'transcribe:chunk',
  transcriptionTest: 'transcribe:test',

  permissionsGet: 'permissions:get',
  permissionsOpenSystemSettings: 'permissions:open-system-settings',

  historyList: 'history:list',
  historyGet: 'history:get',
  historySave: 'history:save',
  historyDelete: 'history:delete',
  historyClear: 'history:clear',

  stopAll: 'activity:stop-all',
  windowSetMode: 'window:set-mode',
  windowHide: 'window:hide',
  windowQuit: 'window:quit',
  activityUpdate: 'activity:update',
  overlayCommand: 'overlay:command',
  hotkeyErrors: 'hotkeys:errors',
  openExternal: 'shell:open-external'
} as const
