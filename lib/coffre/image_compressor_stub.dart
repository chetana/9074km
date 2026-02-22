// Stub non-web : renvoie les bytes d'origine sans modification.
import 'dart:typed_data';

Future<({Uint8List bytes, String contentType, String filename})> compressImage(
  Uint8List bytes,
  String filename,
  String originalContentType,
) async =>
    (bytes: bytes, contentType: originalContentType, filename: filename);
