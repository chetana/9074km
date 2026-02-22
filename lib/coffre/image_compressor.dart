// Conditional import : canvas WebP/JPEG sur web, pass-through sur natif.
export 'image_compressor_stub.dart'
    if (dart.library.html) 'image_compressor_web.dart';
