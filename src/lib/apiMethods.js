// Single list of IPC operations, shared by the main process and the renderer.
export const API_METHODS = [
  'getState', 'putSettings',
  'createClass', 'patchClass', 'deleteClass',
  'createStudent', 'patchStudent', 'deleteStudent',
  'createCategory', 'patchCategory', 'deleteCategory',
  'createPoints',
  'exportToFile', 'importFromFile', 'revealDatabase',
]
