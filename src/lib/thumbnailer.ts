const SEEK_TIME = 0.5; // seconds
const TIMEOUT_MS = 8000;
const THUMB_QUALITY = 0.8;

export async function generateVideoThumbnail(videoUrl: string): Promise<Blob | null> {
	return new Promise((resolve) => {
		const video = document.createElement('video');
		video.crossOrigin = 'anonymous';
		video.muted = true;
		video.preload = 'metadata';
		video.src = videoUrl;

		const timeout = setTimeout(() => {
			cleanup();
			resolve(null);
		}, TIMEOUT_MS);

		function cleanup() {
			clearTimeout(timeout);
			video.removeEventListener('loadedmetadata', onMetadata);
			video.removeEventListener('seeked', onSeeked);
			video.removeEventListener('error', onError);
			video.src = '';
		}

		function onMetadata() {
			video.currentTime = SEEK_TIME;
		}

		function onSeeked() {
			try {
				const canvas = document.createElement('canvas');
				canvas.width = video.videoWidth;
				canvas.height = video.videoHeight;
				const ctx = canvas.getContext('2d');
				if (!ctx) { cleanup(); resolve(null); return; }
				ctx.drawImage(video, 0, 0);
				canvas.toBlob(
					(blob) => { cleanup(); resolve(blob); },
					'image/jpeg',
					THUMB_QUALITY
				);
			} catch {
				cleanup();
				resolve(null);
			}
		}

		function onError() {
			cleanup();
			resolve(null);
		}

		video.addEventListener('loadedmetadata', onMetadata);
		video.addEventListener('seeked', onSeeked);
		video.addEventListener('error', onError);
	});
}
