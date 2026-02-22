import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'auth_service.dart';

const _baseUrl = 'https://chetana.dev';

class CoffreItem {
  final String name;
  final int size;
  final String contentType;
  final String updated;

  const CoffreItem({
    required this.name,
    required this.size,
    required this.contentType,
    required this.updated,
  });

  factory CoffreItem.fromJson(Map<String, dynamic> j) => CoffreItem(
        name: j['name'] as String,
        size: (j['size'] as num).toInt(),
        contentType: j['contentType'] as String? ?? '',
        updated: j['updated'] as String? ?? '',
      );
}

class ListResult {
  final List<String> prefixes;
  final List<CoffreItem> items;
  const ListResult({required this.prefixes, required this.items});
}

Future<Map<String, String>> _authHeaders() async {
  final token = await AuthService.instance.idToken();
  if (token == null) throw Exception('Not authenticated');
  return {'Authorization': 'Bearer $token'};
}

Future<ListResult> listObjects(String prefix) async {
  final headers = await _authHeaders();
  final uri = Uri.parse('$_baseUrl/api/coffre/list').replace(
    queryParameters: {'prefix': prefix},
  );
  final res = await http.get(uri, headers: headers);
  if (res.statusCode != 200) throw Exception('list failed: ${res.statusCode}');
  final body = jsonDecode(res.body) as Map<String, dynamic>;
  final prefixes = (body['prefixes'] as List<dynamic>? ?? []).cast<String>();
  final items = (body['items'] as List<dynamic>? ?? [])
      .map((e) => CoffreItem.fromJson(e as Map<String, dynamic>))
      .toList();
  return ListResult(prefixes: prefixes, items: items);
}

Future<String> signUpload(String path, String contentType) async {
  final headers = {
    ...await _authHeaders(),
    'Content-Type': 'application/json',
  };
  final res = await http.post(
    Uri.parse('$_baseUrl/api/coffre/sign-upload'),
    headers: headers,
    body: jsonEncode({'path': path, 'contentType': contentType}),
  );
  if (res.statusCode != 200) throw Exception('sign-upload failed: ${res.statusCode}');
  final body = jsonDecode(res.body) as Map<String, dynamic>;
  return body['url'] as String;
}

Future<String> signDownload(String path) async {
  final headers = await _authHeaders();
  final uri = Uri.parse('$_baseUrl/api/coffre/sign-download').replace(
    queryParameters: {'path': path},
  );
  final res = await http.get(uri, headers: headers);
  if (res.statusCode != 200) throw Exception('sign-download failed: ${res.statusCode}');
  final body = jsonDecode(res.body) as Map<String, dynamic>;
  return body['url'] as String;
}

Future<void> deleteObject(String path) async {
  final headers = await _authHeaders();
  final uri = Uri.parse('$_baseUrl/api/coffre/delete').replace(
    queryParameters: {'path': path},
  );
  final res = await http.delete(uri, headers: headers);
  if (res.statusCode != 200) throw Exception('delete failed: ${res.statusCode}');
}

// ─── Note du jour (YYYY/MM/DD/note.txt) ──────────────────────────────────────

Future<String?> fetchNote(String year, String month, String day) async {
  final path = '$year/$month/$day/note.txt';
  try {
    final url = await signDownload(path);
    final res = await http.get(Uri.parse(url));
    if (res.statusCode == 200) return utf8.decode(res.bodyBytes);
    return null;
  } catch (_) {
    return null;
  }
}

Future<void> saveNote(
    String year, String month, String day, String text) async {
  final path = '$year/$month/$day/note.txt';
  final bytes = Uint8List.fromList(utf8.encode(text));
  final url = await signUpload(path, 'text/plain');
  await uploadFile(url, bytes, 'text/plain');
}

// ─── Meta uploader (YYYY/MM/DD/meta.json) ────────────────────────────────────

/// Returns {filename: uploaderName} or empty map on error.
Future<Map<String, String>> fetchMeta(String year, String month, String day) async {
  final path = '$year/$month/$day/meta.json';
  try {
    final url = await signDownload(path);
    final res = await http.get(Uri.parse(url));
    if (res.statusCode == 200) {
      final decoded = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
      return decoded.map((k, v) => MapEntry(k, v as String));
    }
    return {};
  } catch (_) {
    return {};
  }
}

Future<void> saveMeta(
    String year, String month, String day, Map<String, String> meta) async {
  final path = '$year/$month/$day/meta.json';
  final bytes = Uint8List.fromList(utf8.encode(jsonEncode(meta)));
  final url = await signUpload(path, 'application/json');
  await uploadFile(url, bytes, 'application/json');
}

// ─── Reactions (YYYY/MM/DD/reactions.json) ───────────────────────────────────

/// Returns {filename: [emoji, ...]} or empty map on error.
Future<Map<String, List<String>>> fetchReactions(
    String year, String month, String day) async {
  final path = '$year/$month/$day/reactions.json';
  try {
    final url = await signDownload(path);
    final res = await http.get(Uri.parse(url));
    if (res.statusCode == 200) {
      final decoded = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
      return decoded.map((k, v) =>
          MapEntry(k, (v as List<dynamic>).cast<String>()));
    }
    return {};
  } catch (_) {
    return {};
  }
}

Future<void> saveReactions(String year, String month, String day,
    Map<String, List<String>> reactions) async {
  final path = '$year/$month/$day/reactions.json';
  final bytes = Uint8List.fromList(utf8.encode(jsonEncode(reactions)));
  final url = await signUpload(path, 'application/json');
  await uploadFile(url, bytes, 'application/json');
}

Future<void> uploadFile(String signedUrl, Uint8List bytes, String contentType) async {
  final res = await http.put(
    Uri.parse(signedUrl),
    headers: {'Content-Type': contentType},
    body: bytes,
  );
  if (res.statusCode != 200) {
    throw Exception('upload failed: ${res.statusCode}');
  }
}
