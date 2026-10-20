// Parseur et injecteur EXIF JPEG minimalistes, purs, sans dépendance. Tolérant : toute donnée
// corrompue ou tronquée donne null, jamais d'exception. L'heure reste l'heure murale locale.
export interface ExifData {
	takenAt: string | null; // AAAA-MM-JJTHH:MM:SS, heure murale locale, jamais convertie en UTC
	offset: string | null; // ex. +07:00
	lat: number | null;
	lng: number | null;
	make: string | null;
	model: string | null;
	orientation: number | null;
}

const TAG = { make: 0x010f, model: 0x0110, orientation: 0x0112, exifPtr: 0x8769, gpsPtr: 0x8825, dto: 0x9003, dtd: 0x9004, offsetO: 0x9011, latRef: 1, lat: 2, lngRef: 3, lng: 4 };

class Reader {
	v: DataView;
	base: number;
	le: boolean;
	constructor(v: DataView, base: number, le: boolean) {
		this.v = v;
		this.base = base;
		this.le = le;
	}
	u16(o: number) { return this.v.getUint16(this.base + o, this.le); }
	u32(o: number) { return this.v.getUint32(this.base + o, this.le); }
	u8(o: number) { return this.v.getUint8(this.base + o); }
	has(o: number, n: number) { return o >= 0 && this.base + o + n <= this.v.byteLength; }
}

type Entry = { type: number; count: number; at: number };

function readIfd(r: Reader, off: number): Map<number, Entry> {
	const out = new Map<number, Entry>();
	if (!r.has(off, 2)) return out;
	const n = Math.min(r.u16(off), 512);
	for (let i = 0; i < n; i++) {
		const e = off + 2 + i * 12;
		if (!r.has(e, 12)) break;
		const type = r.u16(e + 2), count = r.u32(e + 4);
		const size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 } as Record<number, number>)[type] ?? 0;
		const at = size * count <= 4 ? e + 8 : r.u32(e + 8);
		if (size && count <= 1 << 16 && r.has(at, size * count)) out.set(r.u16(e), { type, count, at });
	}
	return out;
}

function ascii(r: Reader, e?: Entry): string | null {
	if (!e || e.type !== 2) return null;
	let s = '';
	for (let i = 0; i < Math.min(e.count, 128); i++) {
		const c = r.u8(e.at + i);
		if (c === 0) break;
		s += String.fromCharCode(c);
	}
	s = s.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
	return s || null;
}

function dms(r: Reader, e?: Entry): number | null {
	if (!e || e.type !== 5 || e.count < 3) return null;
	const part = (i: number) => { const d = r.u32(e.at + i * 8 + 4); return d === 0 ? NaN : r.u32(e.at + i * 8) / d; };
	const v = part(0) + part(1) / 60 + part(2) / 3600;
	return Number.isFinite(v) ? v : null;
}

// Horloge d'appareil fausse : avant 1990 ou après demain (UTC) → date ignorée.
function localIso(s: string | null, now: number): string | null {
	const m = s && /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
	if (!m) return null;
	const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
	if (y < 1990 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
	const t = new Date(Date.UTC(y, mo - 1, d));
	if (t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
	if (t.getTime() > Math.floor(now / 86_400_000) * 86_400_000 + 86_400_000) return null;
	return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

/** Lit l'EXIF d'un JPEG (octets du début du fichier suffisent). null si absent, vide ou illisible. */
export function parseExif(bytes: Uint8Array, now: number = Date.now()): ExifData | null {
	try {
		const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
		let pos = 2, tiff = -1;
		while (pos + 4 <= v.byteLength && v.getUint8(pos) === 0xff) {
			const type = v.getUint8(pos + 1), len = v.getUint16(pos + 2);
			if (type === 0xda || type === 0xd9 || len < 2) break;
			if (type === 0xe1 && len >= 8 && pos + 10 <= v.byteLength && v.getUint32(pos + 4) === 0x45786966 && v.getUint16(pos + 8) === 0) { tiff = pos + 10; break; }
			pos += 2 + len;
		}
		if (tiff < 0 || tiff + 8 > v.byteLength) return null;
		const bom = v.getUint16(tiff);
		if (bom !== 0x4949 && bom !== 0x4d4d) return null;
		const r = new Reader(v, tiff, bom === 0x4949);
		if (r.u16(2) !== 42) return null;
		const ifd0 = readIfd(r, r.u32(4));
		const sub = (tag: number) => { const e = ifd0.get(tag); return e && e.type === 4 ? readIfd(r, r.u32(e.at)) : new Map<number, Entry>(); };
		const exif = sub(TAG.exifPtr), gps = sub(TAG.gpsPtr);
		const dt = localIso(ascii(r, exif.get(TAG.dto)) ?? ascii(r, exif.get(TAG.dtd)), now);
		const off = ascii(r, exif.get(TAG.offsetO));
		let lat = dms(r, gps.get(TAG.lat)), lng = dms(r, gps.get(TAG.lng));
		if (lat !== null && ascii(r, gps.get(TAG.latRef))?.[0] === 'S') lat = -lat;
		if (lng !== null && ascii(r, gps.get(TAG.lngRef))?.[0] === 'W') lng = -lng;
		if (lat !== null && Math.abs(lat) > 90) lat = null;
		if (lng !== null && Math.abs(lng) > 180) lng = null;
		if (lat === null || lng === null) lat = lng = null;
		const o = ifd0.get(TAG.orientation);
		const orientation = o && o.type === 3 ? r.u16(o.at) : null;
		const data: ExifData = {
			takenAt: dt, offset: dt && off && /^[+-](0\d|1[0-4]):[0-5]\d$/.test(off) ? off : null, lat, lng,
			make: ascii(r, ifd0.get(TAG.make)), model: ascii(r, ifd0.get(TAG.model)),
			orientation: orientation !== null && orientation >= 1 && orientation <= 8 ? orientation : null,
		};
		return Object.values(data).some((x) => x !== null) ? data : null;
	} catch {
		return null;
	}
}

/** Lit l'EXIF d'une photo (les 128 premiers Ko suffisent : l'APP1 est en tête de fichier). */
/** Comme readExif mais LÈVE si la lecture du fichier échoue (photothèque, mémoire) : « pas d'EXIF » ≠ « illisible ». */
export async function readExifStrict(file: Blob): Promise<ExifData | null> {
	return parseExif(new Uint8Array(await file.slice(0, 131072).arrayBuffer()));
}

export async function readExif(file: Blob): Promise<ExifData | null> {
	try {
		return await readExifStrict(file);
	} catch {
		return null;
	}
}

type Ent = { tag: number; type: number; count: number; data: Uint8Array };
const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const le32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const str = (s: string): Ent['data'] => Uint8Array.from([...new TextEncoder().encode(s), 0]);
const rat = (n: number, d: number) => [...le32(n), ...le32(d)];
function dmsRat(x: number): Uint8Array {
	const a = Math.abs(x), deg = Math.floor(a), min = Math.floor((a - deg) * 60), sec = Math.round(((a - deg) * 60 - min) * 60 * 10000);
	return Uint8Array.from([...rat(deg, 1), ...rat(min, 1), ...rat(sec, 10000)]);
}

/** Segment APP1 minimal (Orientation remise à 1, date, offset, GPS, marque/modèle) en little-endian. */
export function buildExifSegment(x: ExifData): Uint8Array | null {
	const ifd0: Ent[] = [{ tag: TAG.orientation, type: 3, count: 1, data: Uint8Array.from(le16(1)) }];
	if (x.make) ifd0.push({ tag: TAG.make, type: 2, count: 0, data: str(x.make) });
	if (x.model) ifd0.push({ tag: TAG.model, type: 2, count: 0, data: str(x.model) });
	const exif: Ent[] = [];
	if (x.takenAt) {
		exif.push({ tag: TAG.dto, type: 2, count: 0, data: str(x.takenAt.slice(0, 19).replace(/^(\d{4})-(\d{2})-(\d{2})T/, '$1:$2:$3 ')) });
		if (x.offset) exif.push({ tag: TAG.offsetO, type: 2, count: 0, data: str(x.offset) });
	}
	const gps: Ent[] = [];
	if (x.lat !== null && x.lng !== null) {
		gps.push({ tag: TAG.latRef, type: 2, count: 0, data: str(x.lat < 0 ? 'S' : 'N') }, { tag: TAG.lat, type: 5, count: 3, data: dmsRat(x.lat) },
			{ tag: TAG.lngRef, type: 2, count: 0, data: str(x.lng < 0 ? 'W' : 'E') }, { tag: TAG.lng, type: 5, count: 3, data: dmsRat(x.lng) });
	}
	if (ifd0.length === 1 && !exif.length && !gps.length) return null;
	const ptr = (tag: number): Ent => ({ tag, type: 4, count: 1, data: Uint8Array.of(0, 0, 0, 0) });
	const exifPtr = exif.length ? ptr(TAG.exifPtr) : null, gpsPtr = gps.length ? ptr(TAG.gpsPtr) : null;
	if (exifPtr) ifd0.push(exifPtr);
	if (gpsPtr) ifd0.push(gpsPtr);
	const groups = [ifd0, exif, gps].filter((g) => g.length);
	for (const g of groups) { g.sort((a, b) => a.tag - b.tag); for (const e of g) if (e.type === 2) e.count = e.data.length; }
	const extra = (g: Ent[]) => g.reduce((n, e) => n + (e.data.length > 4 ? e.data.length + (e.data.length & 1) : 0), 0);
	const starts: number[] = []; let at = 8;
	for (const g of groups) { starts.push(at); at += 2 + g.length * 12 + 4 + extra(g); }
	if (exifPtr) exifPtr.data = Uint8Array.from(le32(starts[1]));
	if (gpsPtr) gpsPtr.data = Uint8Array.from(le32(starts[exif.length ? 2 : 1]));
	const out: number[] = [0x49, 0x49, 42, 0, ...le32(8)];
	groups.forEach((g, gi) => {
		let ex = starts[gi] + 2 + g.length * 12 + 4;
		const tail: number[] = [];
		out.push(...le16(g.length));
		for (const e of g) {
			out.push(...le16(e.tag), ...le16(e.type), ...le32(e.count));
			if (e.data.length <= 4) out.push(...e.data, ...new Array(4 - e.data.length).fill(0));
			else { out.push(...le32(ex)); tail.push(...e.data, ...(e.data.length & 1 ? [0] : [])); ex += e.data.length + (e.data.length & 1); }
		}
		out.push(0, 0, 0, 0, ...tail);
	});
	const body = [...new TextEncoder().encode('Exif'), 0, 0, ...out];
	return Uint8Array.from([0xff, 0xe1, ...[(body.length + 2) >> 8, (body.length + 2) & 255], ...body]);
}

/** Insère l'EXIF utile dans un JPEG (après l'éventuel APP0 JFIF). Renvoie le JPEG d'origine si impossible. */
export function injectExif(jpeg: Uint8Array, x: ExifData): Uint8Array {
	try {
		const seg = buildExifSegment(x);
		if (!seg || jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
		let pos = 2;
		if (jpeg[2] === 0xff && jpeg[3] === 0xe0) pos = 4 + ((jpeg[4] << 8) | jpeg[5]);
		if (pos > jpeg.length) return jpeg;
		const out = new Uint8Array(jpeg.length + seg.length);
		out.set(jpeg.subarray(0, pos), 0);
		out.set(seg, pos);
		out.set(jpeg.subarray(pos), pos + seg.length);
		return out;
	} catch {
		return jpeg;
	}
}
