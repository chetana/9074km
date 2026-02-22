import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;

Future<Uint8List?> generateVideoThumbnail(String videoUrl) async {
  try {
    final completer = Completer<Uint8List?>();

    final video = html.VideoElement()
      ..src = videoUrl
      ..crossOrigin = 'anonymous'
      ..muted = true
      ..preload = 'metadata';

    void onSeeked(_) {
      try {
        final canvas = html.CanvasElement(
          width: video.videoWidth,
          height: video.videoHeight,
        );
        canvas.context2D.drawImage(video, 0, 0);
        final dataUrl = canvas.toDataUrl('image/jpeg', 0.8);
        final base64 = dataUrl.split(',').last;
        if (!completer.isCompleted) {
          completer.complete(base64Decode(base64));
        }
      } catch (_) {
        if (!completer.isCompleted) completer.complete(null);
      } finally {
        video.remove();
      }
    }

    video.onLoadedMetadata.listen((_) {
      video.currentTime = 0.5;
    });
    video.onSeeked.first.then(onSeeked);
    video.onError.listen((_) {
      if (!completer.isCompleted) completer.complete(null);
      video.remove();
    });

    Future.delayed(const Duration(seconds: 8), () {
      if (!completer.isCompleted) completer.complete(null);
    });

    return completer.future;
  } catch (_) {
    return null;
  }
}
