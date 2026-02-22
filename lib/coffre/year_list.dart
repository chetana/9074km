import 'package:flutter/material.dart';
import 'coffre_api.dart';

class YearListBody extends StatefulWidget {
  final void Function(String year) onYearSelected;
  const YearListBody({super.key, required this.onYearSelected});

  @override
  State<YearListBody> createState() => _YearListBodyState();
}

class _YearListBodyState extends State<YearListBody> {
  List<String>? _years;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final result = await listObjects('');
      final years = result.prefixes
          .map((p) => p.replaceAll('/', ''))
          .where((p) => RegExp(r'^\d{4}$').hasMatch(p))
          .toList()
        ..sort((a, b) => b.compareTo(a));
      setState(() => _years = years);
    } catch (e) {
      setState(() => _error = e.toString());
    }
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
    if (_years == null) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFFE8A4B8)));
    }
    if (_years!.isEmpty) {
      return const Center(
        child: Text('Aucune photo encore.', style: TextStyle(color: Color(0xFF9090A0))),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _years!.length,
      itemBuilder: (_, i) {
        final year = _years![i];
        return _TimelineCard(
          label: year,
          onTap: () => widget.onYearSelected(year),
        );
      },
    );
  }
}

class _TimelineCard extends StatelessWidget {
  final String label;
  final VoidCallback onTap;

  const _TimelineCard({required this.label, required this.onTap});

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
        trailing: const Icon(Icons.chevron_right, color: Color(0xFFE8A4B8)),
        onTap: onTap,
      ),
    );
  }
}
