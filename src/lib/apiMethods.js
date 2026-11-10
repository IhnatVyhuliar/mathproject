// Single list of IPC operations, shared by the main process and the renderer.
export const API_METHODS = [
  'getState', 'putSettings',
  'createClass', 'patchClass', 'deleteClass',
  'createStudent', 'patchStudent', 'deleteStudent',
  'createCategory', 'patchCategory', 'deleteCategory',
  'createPoints',
  'exportToFile', 'importFromFile', 'revealDatabase',
]

// Most point entries one createPoints call may carry (one atomic transaction).
// Checked in main and, before any optimistic change, in the store.
export const MAX_POINTS_PER_WRITE = 20000
