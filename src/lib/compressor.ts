import type { ExifData } from './exif';

const MAX_DIM = 1600;
const QUALITY = 0.75;
const SKIP_COMPRESS_BYTES = 500_000; // < 500 Ko → pas la peine de compresser

export interface CompressResult {
	blob: Blob;
	contentType: string;
	filename: string;
}

export interface CompressOptions {
	/** Réinjecte date/offset/GPS/marque dans le JPEG réduit (Orientation remise à 1). Activé par défaut. */
	reinjectExif?: boolean;
}

// Sortie toujours en JPEG (Safari ne sait pas encoder le WebP, et le JPEG garde son EXIF) : le canvas efface
// l'EXIF, on remet date, GPS et appareil dans le fichier réduit.
async function withExif(blob: Blob, exif: ExifData | null | undefined, opts?: CompressOptions): Promise<Blob> {
	if (!exif || opts?.reinjectExif === false) return blob;
	try {
		const { injectExif } = await import('./exif');
		const out = injectExif(new Uint8Array(await blob.arrayBuffer()), exif);
		return new Blob([out as BlobPart], { type: 'image/jpeg' });
	} catch {
		return blob;
	}
}

export async function compressImage(file: File, exif?: ExifData | null, opts?: CompressOptions): Promise<CompressResult> {
	// Only compress images, not videos
	if (!file.type.startsWith('image/')) {
		return { blob: file, contentType: file.type, filename: file.name };
	}

	// GIF : une seule image serait gardée, l'animation perdue
	if (file.type === 'image/gif') {
		return { blob: file, contentType: file.type, filename: file.name };
	}

	// Skip compression for small files
	if (file.size < SKIP_COMPRESS_BYTES) {
		return { blob: file, contentType: file.type, filename: file.name };
	}

	try {
		const bitmap = await createImageBitmap(file);
		const { width, height } = bitmap;

		// Calculate new dimensions (max 1600px on longest side)
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

		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, newW, newH);
		ctx.drawImage(bitmap, 0, 0, newW, newH);
		bitmap.close();

		const originalBytes = file.size;

		// Try JPEG
		const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', QUALITY);
		if (jpegBlob && jpegBlob.size < originalBytes) {
			const filename = replaceExt(file.name, '.jpg');
			return { blob: await withExif(jpegBlob, exif, opts), contentType: 'image/jpeg', filename };
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
