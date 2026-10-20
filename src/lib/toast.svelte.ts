export interface ToastItem {
	id: number;
	message: string;
	messageKh?: string;
	actionLabel?: string;
	actionLabelKh?: string;
	onAction?: () => void;
	onExpire?: () => void;
	duration: number;
}

let nextId = 1;

class ToastStore {
	items = $state<ToastItem[]>([]);

	push(t: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }): number {
		const id = nextId++;
		this.items = [...this.items, { duration: 4000, ...t, id }];
		return id;
	}

	dismiss(id: number, reason: 'action' | 'expire' | 'destroy') {
		const t = this.items.find((x) => x.id === id);
		if (!t) return;
		this.items = this.items.filter((x) => x.id !== id);
		if (reason === 'action') t.onAction?.();
		else t.onExpire?.(); // expiration ou démontage : l'action différée (suppression…) part.
	}
}

export const toasts = new ToastStore();
