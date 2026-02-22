import 'package:flutter/material.dart';
import 'coffre_api.dart';

class DayListBody extends StatefulWidget {
  final String year;
  final String month;
  final void Function(String day) onDaySelected;
  const DayListBody({super.key, required this.year, required this.month, required this.onDaySelected});

  @override
  State<DayListBody> createState() => _DayListBodyState();
}

class _DayListBodyState extends State<DayListBody> {
  List<String>? _days;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final result = await listObjects('${widget.year}/${widget.month}/');
      final days = result.prefixes
          .map((p) => p.split('/')[2])
          .where((d) => RegExp(r'^\d{2}$').hasMatch(d))
          .toList()
        ..sort((a, b) => b.compareTo(a));
      setState(() => _days = days);
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  String _dayLabel(String dd) {
    final d = int.tryParse(dd);
    final m = int.tryParse(widget.month);
    final y = int.tryParse(widget.year);
    if (d == null || m == null || y == null) return dd;
    final date = DateTime(y, m, d);
    const frDays = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const kmDays = ['ចន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍', 'អាទិត្យ'];
    final idx = date.weekday - 1; // weekday: 1=Mon, 7=Sun
    return '${widget.year}/${widget.month}/$dd  —  ${frDays[idx]} · ${kmDays[idx]}';
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
    if (_days == null) {
      return const Center(child: CircularProgressIndicator(color: Color(0xFFE8A4B8)));
    }
    if (_days!.isEmpty) {
      return const Center(
        child: Text('Aucun jour.', style: TextStyle(color: Color(0xFF9090A0))),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _days!.length,
      itemBuilder: (_, i) {
        final dd = _days![i];
        return _Card(
          label: _dayLabel(dd),
          onTap: () => widget.onDaySelected(dd),
        );
      },
    );
  }
}

class _Card extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _Card({required this.label, required this.onTap});

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
        title: Text(label, style: const TextStyle(color: Color(0xFFE8E8F0), fontSize: 15)),
        trailing: const Icon(Icons.chevron_right, color: Color(0xFFE8A4B8)),
        onTap: onTap,
      ),
    );
  }
}
