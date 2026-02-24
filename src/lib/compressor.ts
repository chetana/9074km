const MAX_DIM = 2048;
const QUALITY = 0.85;

export interface CompressResult {
	blob: Blob;
	contentType: string;
	filename: string;
}

export async function compressImage(file: File): Promise<CompressResult> {
	// Only compress images, not videos
	if (!file.type.startsWith('image/')) {
		return { blob: file, contentType: file.type, filename: file.name };
	}

	try {
		const bitmap = await createImageBitmap(file);
		const { width, height } = bitmap;

		// Calculate new dimensions (max 2048px on longest side)
		let newW = width;
		let newH = height;
		if (width > MAX_DIM || height > MAX_DIM) {
			if (width >= height) {
				newW = MAX_DIM;
				newH = Math.round((height / width) * MAX_DIM);
			} else {
				newH = MAX_DIM;
				newW = Math.round((width / height) * MAX_DIM);
			}
		}

		// Use OffscreenCanvas if available (better performance)
		let canvas: HTMLCanvasElement | OffscreenCanvas;
		let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

		if (typeof OffscreenCanvas !== 'undefined') {
			canvas = new OffscreenCanvas(newW, newH);
			ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
		} else {
			canvas = document.createElement('canvas');
			(canvas as HTMLCanvasElement).width = newW;
			(canvas as HTMLCanvasElement).height = newH;
			ctx = (canvas as HTMLCanvasElement).getContext('2d') as CanvasRenderingContext2D;
		}

		ctx.drawImage(bitmap, 0, 0, newW, newH);
		bitmap.close();

		const originalBytes = file.size;

		// Try WebP first
		const webpBlob = await canvasToBlob(canvas, 'image/webp', QUALITY);
		if (webpBlob && webpBlob.size < originalBytes) {
			const filename = replaceExt(file.name, '.webp');
			return { blob: webpBlob, contentType: 'image/webp', filename };
		}

		// Try JPEG
		const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', QUALITY);
		if (jpegBlob && jpegBlob.size < originalBytes) {
			const filename = replaceExt(file.name, '.jpg');
			return { blob: jpegBlob, contentType: 'image/jpeg', filename };
		}

		// Fallback: original file
		return { blob: file, contentType: file.type, filename: file.name };
	} catch {
		// Any error → return original
		return { blob: file, contentType: file.type, filename: file.name };
	}
}

async function canvasToBlob(
	canvas: HTMLCanvasElement | OffscreenCanvas,
	mimeType: string,
	quality: number
): Promise<Blob | null> {
	if (canvas instanceof OffscreenCanvas) {
		try {
			return await canvas.convertToBlob({ type: mimeType, quality });
		} catch {
			return null;
		}
	}
	return new Promise((resolve) => {
		canvas.toBlob((blob) => resolve(blob), mimeType, quality);
	});
}

function replaceExt(filename: string, ext: string): string {
	const dot = filename.lastIndexOf('.');
	const base = dot >= 0 ? filename.slice(0, dot) : filename;
	return base + ext;
}
