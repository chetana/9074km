import 'package:flutter/material.dart';
import 'coffre_api.dart';

const _monthNamesFr = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
const _monthNamesKm = [
  '', 'មករា', 'កុម្ភៈ', 'មីនា', 'មេសា', 'ឧសភា', 'មិថុនា',
  'កក្កដា', 'សីហា', 'កញ្ញា', 'តុលា', 'វិច្ឆិកា', 'ធ្នូ',
];

class MonthListBody extends StatefulWidget {
  final String year;
  final void Function(String month) onMonthSelected;
  const MonthListBody({super.key, required this.year, required this.onMonthSelected});

  @override
  State<MonthListBody> createState() => _MonthListBodyState();
}

class _MonthListBodyState extends State<MonthListBody> {
  List<String>? _months;
  Map<String, int> _dayCounts = {};
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final result = await listObjects('${widget.year}/');
      final months = result.prefixes
          .map((p) => p.split('/')[1])
          .where((m) => RegExp(r'^\d{2}$').hasMatch(m))
          .toList()
        ..sort((a, b) => b.compareTo(a));
      setState(() => _months = months);
      final entries = await Future.wait(months.map((m) async {
        try {
          final r = await listObjects('${widget.year}/$m/');
          return MapEntry(m, r.prefixes.length);
        } catch (_) {
          return MapEntry(m, 0);
        }
      }));
      if (mounted) setState(() => _dayCounts = Map.fromEntries(entries));
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  String _label(String mm) {
    final idx = int.tryParse(mm) ?? 0;
    if (idx >= 1 && idx <= 12) {
      return '$mm — ${_monthNamesFr[idx]} · ${_monthNamesKm[idx]}';
    }
    return mm;
  }

  @override
  Widget build(BuildContext context) {
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
    if (_months == null) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFFE8A4B8)));
    }
    if (_months!.isEmpty) {
      return const Center(
        child: Text('Aucun mois.', style: TextStyle(color: Color(0xFF9090A0))),
      );
    }
    return ListView.builder(
      key: PageStorageKey('month-list-${widget.year}'),
      padding: const EdgeInsets.all(16),
      itemCount: _months!.length,
      itemBuilder: (_, i) {
        final mm = _months![i];
        final n = _dayCounts[mm];
        final sub = n == null ? null : '$n jours · $n ថ្ងៃ';
        return _Card(
          label: _label(mm),
          subtitle: sub,
          onTap: () => widget.onMonthSelected(mm),
        );
      },
    );
  }
}

class _Card extends StatelessWidget {
  final String label;
  final String? subtitle;
  final VoidCallback onTap;
  const _Card({required this.label, required this.onTap, this.subtitle});

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFF1E1E30),
      margin: const EdgeInsets.symmetric(vertical: 6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: Color(0xFFE8A4B8), width: 0.3),
      ),
      child: ListTile(
        title: Text(label, style: const TextStyle(color: Color(0xFFE8E8F0), fontSize: 18)),
        subtitle: subtitle != null
            ? Text(subtitle!, style: const TextStyle(color: Color(0xFF9090A0), fontSize: 12))
            : null,
        trailing: const Icon(Icons.chevron_right, color: Color(0xFFE8A4B8)),
        onTap: onTap,
      ),
    );
  }
}
