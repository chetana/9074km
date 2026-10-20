// Pont entre la liste des évènements (suggestions, « à classer ») et la barre du haut (qui affiche les boutons).
export const suggestionBar = $state<{ count: number; open: (() => void) | null; todo: number; openSort: (() => void) | null }>({ count: 0, open: null, todo: 0, openSort: null });
