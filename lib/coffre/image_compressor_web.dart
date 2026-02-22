// Compression canvas — web uniquement.
// Essaie WebP d'abord (Chrome/Android), fallback JPEG (Safari inclus).
// N'utilise le résultat que s'il est plus petit que l'original.
import 'dart:async';
import 'dart:convert';
import 'dart:html' as html;
import 'dart:typed_data';

const _maxDimension = 2048; // px — réduit les très grandes photos
const _quality = 0.85;

Future<({Uint8List bytes, String contentType, String filename})> compressImage(
  Uint8List bytes,
  String filename,
  String originalContentType,
) async {
  try {
    // Charge l'image dans un ImageElement via un object URL
    final blob = html.Blob([bytes]);
    final objectUrl = html.Url.createObjectUrlFromBlob(blob);

    final img = html.ImageElement();
    final loadCompleter = Completer<bool>();
    img.onLoad.first.then((_) => loadCompleter.complete(true));
    img.onError.first.then((_) => loadCompleter.complete(false));
    img.src = objectUrl;

    final loaded = await loadCompleter.future;
    html.Url.revokeObjectUrl(objectUrl);

    if (!loaded) return _passthrough(bytes, filename, originalContentType);

    // Calcule les dimensions en respectant la limite max
    int w = img.naturalWidth, h = img.naturalHeight;
    if (w > _maxDimension || h > _maxDimension) {
      if (w > h) {
        h = h * _maxDimension ~/ w;
        w = _maxDimension;
      } else {
        w = w * _maxDimension ~/ h;
        h = _maxDimension;
      }
    }

    final canvas = html.CanvasElement(width: w, height: h);
    canvas.context2D.drawImageScaled(img, 0, 0, w, h);

    final baseName = filename.replaceAll(RegExp(r'\.\w+$'), '');

    // 1. Essai WebP (Chrome, Edge, Firefox, Android Chrome)
    final webpBytes = _canvasToBytes(canvas, 'image/webp', _quality);
    if (webpBytes != null && webpBytes.length < bytes.length) {
      return (bytes: webpBytes, contentType: 'image/webp', filename: '$baseName.webp');
    }

    // 2. Fallback JPEG — universel Safari inclus, toDataUrl JPEG est garanti
    final jpegBytes = _canvasToBytes(canvas, 'image/jpeg', _quality);
    if (jpegBytes != null && jpegBytes.length < bytes.length) {
      return (bytes: jpegBytes, contentType: 'image/jpeg', filename: '$baseName.jpg');
    }
  } catch (_) {
    // Si quoi que ce soit plante : original intact
  }
  return _passthrough(bytes, filename, originalContentType);
}

// toDataUrl est synchrone et accepte la qualité en 2e argument.
// Retourne null si le navigateur a encodé dans un autre format (ex: Safari → PNG au lieu de WebP).
Uint8List? _canvasToBytes(html.CanvasElement canvas, String mimeType, double quality) {
  try {
    final dataUrl = canvas.toDataUrl(mimeType, quality);
    if (!dataUrl.startsWith('data:$mimeType')) return null; // format non supporté par le navigateur
    final base64 = dataUrl.split(',')[1];
    return base64Decode(base64);
  } catch (_) {
    return null;
  }
}

({Uint8List bytes, String contentType, String filename}) _passthrough(
  Uint8List bytes,
  String filename,
  String contentType,
) =>
    (bytes: bytes, contentType: contentType, filename: filename);
