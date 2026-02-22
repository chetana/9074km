import 'dart:typed_data';
import 'package:chewie/chewie.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import 'package:video_player/video_player.dart';
import 'coffre_api.dart';
import 'image_compressor.dart';

enum _UploadPhase { idle, compressing, uploading }

class DayFilesScreen extends StatefulWidget {
  final String year;
  final String month;
  final String day;
  final VoidCallback? onPrevDay;
  final VoidCallback? onNextDay;
  final void Function(String day)? onDayJump;

  const DayFilesScreen({
    super.key,
    required this.year,
    required this.month,
    required this.day,
    this.onPrevDay,
    this.onNextDay,
    this.onDayJump,
  });

  @override
  State<DayFilesScreen> createState() => _DayFilesScreenState();
}

class _DayFilesScreenState extends State<DayFilesScreen> {
  List<CoffreItem>? _items;
  List<String>? _days;
  Map<String, int> _dayCounts = {};
  String? _error;
  int _columns = 3;
  _UploadPhase _phase = _UploadPhase.idle;
  int _current = 0;
  int _total = 0;
  bool _selectionMode = false;
  final Set<String> _selected = {};
  final Map<String, String?> _urlCache = {};

  String get _prefix => '${widget.year}/${widget.month}/${widget.day}/';
  String get _monthPrefix => '${widget.year}/${widget.month}/';

  @override
  void initState() {
    super.initState();
    _load();
    _loadDays();
  }

  @override
  void didUpdateWidget(DayFilesScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    final dayChanged = oldWidget.year != widget.year ||
        oldWidget.month != widget.month ||
        oldWidget.day != widget.day;
    final monthChanged = oldWidget.year != widget.year ||
        oldWidget.month != widget.month;
    if (dayChanged) {
      setState(() { _items = null; _urlCache.clear(); });
      _load();
    }
    if (monthChanged) {
      setState(() => _days = null);
      _loadDays();
    }
  }

  Future<void> _loadDays() async {
    try {
      final result = await listObjects(_monthPrefix);
      final days = result.prefixes
          .map((p) => p.split('/')[2])
          .where((d) => RegExp(r'^\d{2}$').hasMatch(d))
          .toList()
        ..sort();
      if (mounted) setState(() => _days = days);
      // Charge les compteurs en parallèle
      final entries = await Future.wait(days.map((d) async {
        try {
          final r = await listObjects('${widget.year}/${widget.month}/$d/');
          return MapEntry(d, r.items.length);
        } catch (_) {
          return MapEntry(d, 0);
        }
      }));
      if (mounted) setState(() => _dayCounts = Map.fromEntries(entries));
    } catch (_) {
      // silencieux — les chips sont bonus
    }
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final result = await listObjects(_prefix);
      setState(() => _items = result.items);
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  String _contentTypeFor(String filename) {
    final ext = filename.split('.').last.toLowerCase();
    const map = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'heic': 'image/heic',
      'mp4': 'video/mp4',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      'mkv': 'video/x-matroska',
    };
    return map[ext] ?? 'application/octet-stream';
  }

  Future<void> _upload() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.media,
      withData: true,
      allowMultiple: true,
    );
    if (result == null || result.files.isEmpty) return;

    final files = result.files.where((f) => f.bytes != null).toList();
    if (files.isEmpty) return;

    // ── Phase 1 : compression des images ─────────────────────────────────────
    setState(() { _phase = _UploadPhase.compressing; _current = 0; _total = files.length; });

    final processed = <({Uint8List bytes, String contentType, String filename})>[];
    for (int i = 0; i < files.length; i++) {
      setState(() => _current = i + 1);
      final file = files[i];
      final ct = _contentTypeFor(file.name);
      if (ct.startsWith('image/')) {
        processed.add(await compressImage(file.bytes!, file.name, ct));
      } else {
        // Vidéo ou autre : pas de compression, envoi direct
        processed.add((bytes: file.bytes!, contentType: ct, filename: file.name));
      }
    }

    // ── Phase 2 : upload ──────────────────────────────────────────────────────
    setState(() { _phase = _UploadPhase.uploading; _current = 0; });

    final errors = <String>[];
    for (int i = 0; i < processed.length; i++) {
      setState(() => _current = i + 1);
      final item = processed[i];
      final path = '$_prefix${item.filename}';
      try {
        final signedUrl = await signUpload(path, item.contentType);
        await uploadFile(signedUrl, item.bytes, item.contentType);
      } catch (_) {
        errors.add(item.filename);
      }
    }

    await _load();

    if (mounted && errors.isNotEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Erreur sur ${errors.length} fichier(s) : ${errors.join(', ')}'),
          backgroundColor: Colors.redAccent,
        ),
      );
    }

    setState(() { _phase = _UploadPhase.idle; _current = 0; _total = 0; });
  }

  Future<String?> _getCachedUrl(String name) async {
    if (_urlCache.containsKey(name)) return _urlCache[name];
    try {
      final url = await signDownload(name);
      if (mounted) _urlCache[name] = url;
      return url;
    } catch (_) {
      _urlCache[name] = null;
      return null;
    }
  }

  void _openViewer(int index) {
    showDialog(
      context: context,
      builder: (_) => _FileViewer(
        items: List.from(_items!),
        initialIndex: index,
      ),
    );
  }

  void _enterSelectionMode(String name) {
    setState(() {
      _selectionMode = true;
      _selected.add(name);
    });
  }

  void _toggleSelection(String name) {
    setState(() {
      if (_selected.contains(name)) {
        _selected.remove(name);
        if (_selected.isEmpty) _selectionMode = false;
      } else {
        _selected.add(name);
      }
    });
  }

  void _exitSelectionMode() {
    setState(() {
      _selectionMode = false;
      _selected.clear();
    });
  }

  Future<void> _deleteSelected() async {
    final toDelete = List<String>.from(_selected);
    _exitSelectionMode();
    int errors = 0;
    for (final name in toDelete) {
      try {
        await deleteObject(name);
      } catch (_) {
        errors++;
      }
    }
    await _load();
    if (mounted && errors > 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('$errors suppression(s) échouée(s)'),
          backgroundColor: Colors.redAccent,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0F1A),
      appBar: AppBar(
        automaticallyImplyLeading: false,
        backgroundColor: const Color(0xFF0F0F1A),
        foregroundColor: const Color(0xFFE8A4B8),
        toolbarHeight: 0,
      ),
      floatingActionButton: _selectionMode ? null : FloatingActionButton(
        onPressed: _phase != _UploadPhase.idle ? null : _upload,
        backgroundColor: const Color(0xFFE8A4B8),
        foregroundColor: const Color(0xFF0F0F1A),
        child: switch (_phase) {
          _UploadPhase.idle => const Icon(Icons.add),
          _UploadPhase.compressing => _FabProgress(
              icon: Icons.auto_awesome,
              current: _current,
              total: _total,
            ),
          _UploadPhase.uploading => _FabProgress(
              spinner: true,
              current: _current,
              total: _total,
            ),
        },
      ),
      bottomNavigationBar: _selectionMode
          ? SafeArea(
              child: Container(
                color: const Color(0xFF1E1E30),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(
                  children: [
                    TextButton.icon(
                      onPressed: _exitSelectionMode,
                      icon: const Icon(Icons.close, color: Color(0xFF9090A0)),
                      label: const Text('Annuler', style: TextStyle(color: Color(0xFF9090A0))),
                    ),
                    const Spacer(),
                    Text(
                      '${_selected.length} sélectionné${_selected.length > 1 ? 's' : ''}',
                      style: const TextStyle(color: Color(0xFFE8E8F0), fontSize: 13),
                    ),
                    const Spacer(),
                    TextButton.icon(
                      onPressed: _selected.isEmpty ? null : _deleteSelected,
                      icon: const Icon(Icons.delete_outline, color: Colors.redAccent),
                      label: const Text('Supprimer', style: TextStyle(color: Colors.redAccent)),
                    ),
                  ],
                ),
              ),
            )
          : null,
      body: LayoutBuilder(
        builder: (context, constraints) {
          final maxChipsHeight = constraints.maxHeight * 0.45;
          return Column(
            children: [
              _DayNavBar(
                year: widget.year,
                month: widget.month,
                day: widget.day,
                onPrev: widget.onPrevDay,
                onNext: widget.onNextDay,
                columns: _columns,
                onToggleZoom: () => setState(() {
                  _columns = _columns == 4 ? 2 : _columns + 1;
                }),
              ),
              if (_days != null && _days!.isNotEmpty)
                ConstrainedBox(
                  constraints: BoxConstraints(maxHeight: maxChipsHeight),
                  child: _DaysChipBar(
                    days: _days!,
                    counts: _dayCounts,
                    selected: widget.day,
                    year: widget.year,
                    month: widget.month,
                    onTap: widget.onDayJump,
                  ),
                ),
              Expanded(child: _body()),
            ],
          );
        },
      ),
    );
  }

  Widget _body() {
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(_error!, style: const TextStyle(color: Colors.redAccent)),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _load, child: const Text('Réessayer')),
          ],
        ),
      );
    }
    if (_items == null) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFFE8A4B8)));
    }
    if (_items!.isEmpty) {
      return const Center(
        child: Text('Aucun fichier. Appuie sur + pour uploader.',
            style: TextStyle(color: Color(0xFF9090A0))),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      color: const Color(0xFFE8A4B8),
      backgroundColor: const Color(0xFF1E1E30),
      child: GridView.builder(
      padding: const EdgeInsets.all(12),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: _columns,
        crossAxisSpacing: 8,
        mainAxisSpacing: 8,
      ),
      itemCount: _items!.length,
      itemBuilder: (_, i) => _FileTile(
        key: ValueKey(_items![i].name),
        item: _items![i],
        getUrl: _getCachedUrl,
        selectionMode: _selectionMode,
        selected: _selected.contains(_items![i].name),
        onTap: () => _selectionMode
            ? _toggleSelection(_items![i].name)
            : _openViewer(i),
        onLongPress: () => _selectionMode
            ? _toggleSelection(_items![i].name)
            : _enterSelectionMode(_items![i].name),
      ),
      ),  // RefreshIndicator
    );
  }
}

// ─── FAB progress indicator ───────────────────────────────────────────────────

class _FabProgress extends StatelessWidget {
  final bool spinner;
  final IconData? icon;
  final int current;
  final int total;

  const _FabProgress({
    this.spinner = false,
    this.icon,
    required this.current,
    required this.total,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (spinner)
          const SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF0F0F1A)),
          )
        else
          Icon(icon, size: 18, color: const Color(0xFF0F0F1A)),
        if (total > 1) ...[
          const SizedBox(height: 2),
          Text(
            '$current/$total',
            style: const TextStyle(
              fontSize: 9,
              color: Color(0xFF0F0F1A),
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ],
    );
  }
}

class _DaysChipBar extends StatefulWidget {
  final List<String> days;
  final Map<String, int> counts;
  final String selected;
  final String year;
  final String month;
  final void Function(String day)? onTap;

  const _DaysChipBar({
    required this.days,
    required this.counts,
    required this.selected,
    required this.year,
    required this.month,
    this.onTap,
  });

  @override
  State<_DaysChipBar> createState() => _DaysChipBarState();
}

class _DaysChipBarState extends State<_DaysChipBar> {
  final _scrollController = ScrollController();
  final _selectedKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToSelected());
  }

  @override
  void didUpdateWidget(_DaysChipBar old) {
    super.didUpdateWidget(old);
    if (old.selected != widget.selected) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToSelected());
    }
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToSelected() {
    final ctx = _selectedKey.currentContext;
    if (ctx != null) {
      Scrollable.ensureVisible(ctx,
          alignment: 0.5, duration: const Duration(milliseconds: 300));
    }
  }

  String _label(String dd) {
    final d = int.tryParse(dd);
    final m = int.tryParse(widget.month);
    final y = int.tryParse(widget.year);
    if (d == null || m == null || y == null) return dd;
    final date = DateTime(y, m, d);
    const kmDays = ['ចន្ទ', 'អង្គារ', 'ពុធ', 'ព្រ', 'សុក្រ', 'សៅរ៍', 'អាទិត្យ'];
    final count = widget.counts[dd];
    final countStr = (count != null && count > 0) ? ' ($count)' : '';
    return '$dd$countStr\n${kmDays[date.weekday - 1]}';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFF0D0D1C),
      child: SingleChildScrollView(
        controller: _scrollController,
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        child: Row(
          children: widget.days.map((dd) {
            final isSelected = dd == widget.selected;
            return GestureDetector(
              key: isSelected ? _selectedKey : null,
              onTap: widget.onTap != null && !isSelected ? () => widget.onTap!(dd) : null,
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 4),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: isSelected ? const Color(0xFFE8A4B8) : const Color(0xFF1E1E30),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: isSelected ? const Color(0xFFE8A4B8) : const Color(0xFF3A3A50),
                    width: 1,
                  ),
                ),
                child: Text(
                  _label(dd),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: isSelected ? const Color(0xFF0F0F1A) : const Color(0xFFB0B0C0),
                    fontSize: 11,
                    fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                    height: 1.4,
                  ),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

class _DayNavBar extends StatelessWidget {
  final String year, month, day;
  final VoidCallback? onPrev;
  final VoidCallback? onNext;
  final int columns;
  final VoidCallback? onToggleZoom;

  const _DayNavBar({
    required this.year,
    required this.month,
    required this.day,
    this.onPrev,
    this.onNext,
    this.columns = 3,
    this.onToggleZoom,
  });

  String _label() {
    final y = int.tryParse(year);
    final m = int.tryParse(month);
    final d = int.tryParse(day);
    if (y == null || m == null || d == null) return '$year/$month/$day';
    final date = DateTime(y, m, d);
    const frDays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const kmDays = ['ចន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍', 'អាទិត្យ'];
    const frMonths = ['', 'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    final idx = date.weekday - 1;
    return '${frDays[idx]} · ${kmDays[idx]}  ${frMonths[m]} $d';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFF131320),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.chevron_left, color: Color(0xFFE8A4B8)),
            onPressed: onPrev,
            tooltip: 'Jour précédent',
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
          Expanded(
            child: Text(
              _label(),
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Color(0xFFE8E8F0),
                fontSize: 13,
                letterSpacing: 0.5,
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.chevron_right, color: Color(0xFFE8A4B8)),
            onPressed: onNext,
            tooltip: 'Jour suivant',
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
          IconButton(
            icon: Icon(
              columns == 2
                  ? Icons.grid_on
                  : columns == 3
                      ? Icons.grid_view
                      : Icons.view_comfy,
              color: const Color(0xFF9090A0),
              size: 18,
            ),
            onPressed: onToggleZoom,
            tooltip: 'Changer le zoom',
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
        ],
      ),
    );
  }
}

class _FileTile extends StatefulWidget {
  final CoffreItem item;
  final Future<String?> Function(String name) getUrl;
  final bool selectionMode;
  final bool selected;
  final VoidCallback onTap;
  final VoidCallback onLongPress;
  const _FileTile({
    super.key,
    required this.item,
    required this.getUrl,
    required this.selectionMode,
    required this.selected,
    required this.onTap,
    required this.onLongPress,
  });

  @override
  State<_FileTile> createState() => _FileTileState();
}

class _FileTileState extends State<_FileTile> {
  String? _signedUrl;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _loadUrl();
  }

  Future<void> _loadUrl() async {
    final url = await widget.getUrl(widget.item.name);
    if (mounted) setState(() { _signedUrl = url; _loading = false; });
  }

  bool get _isVideo {
    final ct = widget.item.contentType.toLowerCase();
    return ct.startsWith('video/');
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      onLongPress: widget.onLongPress,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Container(
            decoration: BoxDecoration(
              color: const Color(0xFF1E1E30),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(
                color: widget.selected
                    ? const Color(0xFFE8A4B8)
                    : const Color(0xFFE8A4B8),
                width: widget.selected ? 2.5 : 0.3,
              ),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Opacity(
                opacity: widget.selectionMode && !widget.selected ? 0.5 : 1.0,
                child: _loading
                    ? const Center(
                        child: CircularProgressIndicator(
                          strokeWidth: 1.5,
                          color: Color(0xFFE8A4B8),
                        ),
                      )
                    : _signedUrl == null
                        ? _icon()
                        : _isVideo
                            ? _videoThumbnail()
                            : Image.network(
                                _signedUrl!,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => _icon(),
                              ),
              ),
            ),
          ),
          if (widget.selectionMode)
            Positioned(
              top: 6,
              right: 6,
              child: Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: widget.selected
                      ? const Color(0xFFE8A4B8)
                      : Colors.black.withOpacity(0.5),
                  border: Border.all(color: Colors.white, width: 1.5),
                ),
                child: widget.selected
                    ? const Icon(Icons.check, size: 14, color: Color(0xFF0F0F1A))
                    : null,
              ),
            ),
        ],
      ),
    );
  }

  Widget _icon() {
    return Center(
      child: Icon(
        _isVideo ? Icons.videocam : Icons.insert_drive_file,
        color: const Color(0xFFE8A4B8),
        size: 32,
      ),
    );
  }

  Widget _videoThumbnail() {
    return Stack(
      fit: StackFit.expand,
      children: [
        const ColoredBox(color: Color(0xFF1A1A2E)),
        const Center(
          child: Icon(Icons.play_circle_outline, color: Color(0xFFE8A4B8), size: 40),
        ),
        Positioned(
          bottom: 4,
          right: 4,
          child: Text(
            widget.item.name.split('/').last,
            style: const TextStyle(color: Color(0xFF9090A0), fontSize: 8),
            overflow: TextOverflow.ellipsis,
            maxLines: 1,
          ),
        ),
      ],
    );
  }
}

// ─── File Viewer — PageView plein écran, peek effect, cross-day, share ────────

class _FileViewer extends StatefulWidget {
  final List<CoffreItem> items;
  final int initialIndex;

  const _FileViewer({required this.items, required this.initialIndex});

  @override
  State<_FileViewer> createState() => _FileViewerState();
}

class _FileViewerState extends State<_FileViewer> {
  late List<CoffreItem> _items;
  late PageController _pageController;
  int _currentIndex = 0;
  final Map<String, String?> _urlCache = {};
  bool _loadingPrev = false;
  bool _loadingNext = false;

  DateTime _dateOf(CoffreItem item) {
    final p = item.name.split('/');
    if (p.length >= 3) {
      final y = int.tryParse(p[0]);
      final m = int.tryParse(p[1]);
      final d = int.tryParse(p[2]);
      if (y != null && m != null && d != null) return DateTime(y, m, d);
    }
    return DateTime.now();
  }

  String _prefixFor(DateTime date) =>
      '${date.year}/${date.month.toString().padLeft(2, '0')}/${date.day.toString().padLeft(2, '0')}/';

  @override
  void initState() {
    super.initState();
    _items = List.from(widget.items);
    _currentIndex = widget.initialIndex;
    _pageController = PageController(
      initialPage: widget.initialIndex,
      viewportFraction: 0.92,
    );
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _onPageChanged(int index) {
    setState(() => _currentIndex = index);
    if (index == 0 && !_loadingPrev) _loadAdjacent(-1);
    if (index == _items.length - 1 && !_loadingNext) _loadAdjacent(1);
  }

  Future<void> _loadAdjacent(int direction) async {
    if (direction == -1) {
      setState(() => _loadingPrev = true);
    } else {
      setState(() => _loadingNext = true);
    }
    try {
      final ref = direction == -1 ? _items.first : _items.last;
      final refDate = _dateOf(ref);
      for (int delta = 1; delta <= 60; delta++) {
        final candidate = refDate.add(Duration(days: direction * delta));
        final result = await listObjects(_prefixFor(candidate));
        if (result.items.isNotEmpty) {
          if (!mounted) return;
          if (direction == -1) {
            final n = result.items.length;
            setState(() {
              _items = [...result.items, ..._items];
              _currentIndex += n;
              _loadingPrev = false;
            });
            WidgetsBinding.instance.addPostFrameCallback((_) {
              if (mounted) _pageController.jumpToPage(_currentIndex);
            });
          } else {
            setState(() {
              _items = [..._items, ...result.items];
              _loadingNext = false;
            });
          }
          return;
        }
      }
    } catch (_) {}
    if (mounted) {
      setState(() {
        if (direction == -1) _loadingPrev = false;
        else _loadingNext = false;
      });
    }
  }

  Future<String?> _getUrl(String name) async {
    if (_urlCache.containsKey(name)) return _urlCache[name];
    try {
      final url = await signDownload(name);
      _urlCache[name] = url;
      return url;
    } catch (_) {
      _urlCache[name] = null;
      return null;
    }
  }

  Future<void> _share() async {
    final name = _items[_currentIndex].name;
    final url = await _getUrl(name);
    if (url == null || !mounted) return;
    await Share.shareUri(Uri.parse(url));
  }

  @override
  Widget build(BuildContext context) {
    final filename = _items[_currentIndex].name.split('/').last;
    return Dialog.fullscreen(
      backgroundColor: Colors.black,
      child: Stack(
        children: [
          PageView.builder(
            controller: _pageController,
            onPageChanged: _onPageChanged,
            itemCount: _items.length,
            itemBuilder: (_, index) => Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: _PageContent(
                key: ValueKey(_items[index].name),
                item: _items[index],
                getUrl: _getUrl,
              ),
            ),
          ),
          // Barre supérieure avec dégradé
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Colors.black.withOpacity(0.75), Colors.transparent],
                ),
              ),
              child: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.close, color: Colors.white),
                        onPressed: () => Navigator.pop(context),
                        tooltip: 'Fermer',
                      ),
                      Expanded(
                        child: Text(
                          filename,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Color(0xFFCCCCCC), fontSize: 12),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.share, color: Colors.white),
                        onPressed: _share,
                        tooltip: 'Partager',
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Page Content — lecteur vidéo / viewer image, une instance par page ───────

class _PageContent extends StatefulWidget {
  final CoffreItem item;
  final Future<String?> Function(String name) getUrl;

  const _PageContent({super.key, required this.item, required this.getUrl});

  @override
  State<_PageContent> createState() => _PageContentState();
}

class _PageContentState extends State<_PageContent> {
  String? _url;
  bool _loading = true;
  VideoPlayerController? _vpController;
  ChewieController? _chewieController;

  bool get _isVideo => widget.item.contentType.toLowerCase().startsWith('video/');

  @override
  void initState() {
    super.initState();
    _fetch();
  }

  Future<void> _fetch() async {
    final url = await widget.getUrl(widget.item.name);
    if (!mounted) return;
    setState(() { _url = url; _loading = false; });
    if (_isVideo && url != null) _initVideo(url);
  }

  Future<void> _initVideo(String url) async {
    final vpc = VideoPlayerController.networkUrl(Uri.parse(url));
    await vpc.initialize();
    if (!mounted) { vpc.dispose(); return; }
    final cc = ChewieController(
      videoPlayerController: vpc,
      autoPlay: false,
      looping: false,
      allowFullScreen: true,
      materialProgressColors: ChewieProgressColors(
        playedColor: const Color(0xFFE8A4B8),
        handleColor: const Color(0xFFE8A4B8),
        bufferedColor: const Color(0xFF3A3A50),
        backgroundColor: const Color(0xFF1A1A2E),
      ),
    );
    if (mounted) setState(() { _vpController = vpc; _chewieController = cc; });
  }

  @override
  void dispose() {
    _chewieController?.dispose();
    _vpController?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFFE8A4B8)));
    }
    if (_url == null) {
      return const Center(child: Icon(Icons.broken_image, color: Color(0xFF9090A0), size: 48));
    }
    if (_isVideo) {
      if (_chewieController == null) {
        return const Center(child: CircularProgressIndicator(color: Color(0xFFE8A4B8)));
      }
      return Center(
        child: AspectRatio(
          aspectRatio: _vpController!.value.aspectRatio,
          child: Chewie(controller: _chewieController!),
        ),
      );
    }
    return InteractiveViewer(
      child: Center(child: Image.network(_url!, fit: BoxFit.contain)),
    );
  }
}
