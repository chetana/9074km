// Pont entre la liste des évènements (qui connaît les suggestions) et la barre du haut (qui affiche le bouton).
export const suggestionBar = $state<{ count: number; open: (() => void) | null }>({ count: 0, open: null });
