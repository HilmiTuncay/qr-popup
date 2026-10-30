const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qry', {
  onQR: (fn) => ipcRenderer.on('qr', (_e, d) => fn(d)),
  onStatus: (fn) => ipcRenderer.on('status', (_e, d) => fn(d)),
  getCfg: () => ipcRenderer.invoke('cfg:get'),
  setCfg: (patch) => ipcRenderer.invoke('cfg:set', patch),
  showSource: () => ipcRenderer.invoke('source:show'),
  openDemo: () => ipcRenderer.invoke('demo:open'),
  resizeStart: (corner) => ipcRenderer.send('resize:start', corner),
  resizeMove: (dx, dy) => ipcRenderer.send('resize:move', dx, dy),
  resizeEnd: () => ipcRenderer.send('resize:end'),
  toggleBig: () => ipcRenderer.send('overlay:big'),
  minimize: () => ipcRenderer.send('overlay:min'),
});
