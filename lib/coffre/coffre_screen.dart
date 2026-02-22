import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'auth_service.dart';
import 'year_list.dart';
import 'month_list.dart';
import 'day_list.dart';
import 'day_files.dart';

class CoffreScreen extends StatefulWidget {
  const CoffreScreen({super.key});

  @override
  State<CoffreScreen> createState() => _CoffreScreenState();
}

class _CoffreScreenState extends State<CoffreScreen> {
  GoogleSignInAccount? _user;
  bool _loading = false;
  String? _year;
  String? _month;
  String? _day;

  @override
  void initState() {
    super.initState();
    _user = AuthService.instance.currentUser;
    if (_user == null) _trySilent();
  }

  Future<void> _trySilent() async {
    final token = await AuthService.instance.idToken();
    if (token != null && mounted) {
      setState(() => _user = AuthService.instance.currentUser);
    }
  }

  Future<void> _signIn() async {
    setState(() => _loading = true);
    final account = await AuthService.instance.signIn();
    setState(() {
      _user = account;
      _loading = false;
    });
  }

  Future<void> _signOut() async {
    await AuthService.instance.signOut();
    setState(() {
      _user = null;
      _year = null;
      _month = null;
      _day = null;
    });
  }

  void _goToToday() {
    final now = DateTime.now();
    setState(() {
      _year = now.year.toString();
      _month = now.month.toString().padLeft(2, '0');
      _day = now.day.toString().padLeft(2, '0');
    });
  }

  void _changeDay(int delta) {
    final current = DateTime(int.parse(_year!), int.parse(_month!), int.parse(_day!));
    final next = current.add(Duration(days: delta));
    setState(() {
      _year = next.year.toString();
      _month = next.month.toString().padLeft(2, '0');
      _day = next.day.toString().padLeft(2, '0');
    });
  }

  Future<void> _pickDate() async {
    final initial = (_year != null && _month != null && _day != null)
        ? DateTime(int.parse(_year!), int.parse(_month!), int.parse(_day!))
        : DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime(2035),
      builder: (ctx, child) => Theme(
        data: ThemeData.dark().copyWith(
          colorScheme: const ColorScheme.dark(
            primary: Color(0xFFE8A4B8),
            onPrimary: Color(0xFF0F0F1A),
            surface: Color(0xFF1E1E30),
            onSurface: Color(0xFFE8E8F0),
          ),
          dialogBackgroundColor: const Color(0xFF1E1E30),
        ),
        child: child!,
      ),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _year = picked.year.toString();
      _month = picked.month.toString().padLeft(2, '0');
      _day = picked.day.toString().padLeft(2, '0');
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_user == null) {
      return _SignInGate(onSignIn: _signIn, loading: _loading);
    }
    return Scaffold(
      backgroundColor: const Color(0xFF0F0F1A),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F0F1A),
        foregroundColor: const Color(0xFFE8A4B8),
        title: _Breadcrumb(
          year: _year,
          month: _month,
          day: _day,
          onTapRoot: () => setState(() {
            _year = null;
            _month = null;
            _day = null;
          }),
          onTapYear: () => setState(() {
            _month = null;
            _day = null;
          }),
          onTapMonth: () => setState(() => _day = null),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.calendar_month),
            onPressed: _pickDate,
            tooltip: 'Choisir une date',
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: _signOut,
            tooltip: 'Déconnexion',
          ),
        ],
      ),
      floatingActionButton: _year == null
          ? FloatingActionButton.extended(
              onPressed: _goToToday,
              backgroundColor: const Color(0xFFE8A4B8),
              foregroundColor: const Color(0xFF0F0F1A),
              icon: const Icon(Icons.today),
              label: const Text("Aujourd'hui · ថ្ងៃនេះ"),
            )
          : null,
      body: _body(),
    );
  }

  Widget _body() {
    if (_year == null) {
      return YearListBody(
        onYearSelected: (y) => setState(() {
          _year = y;
          _month = null;
          _day = null;
        }),
      );
    }
    if (_month == null) {
      return MonthListBody(
        year: _year!,
        onMonthSelected: (m) => setState(() {
          _month = m;
          _day = null;
        }),
      );
    }
    if (_day == null) {
      return DayListBody(
        year: _year!,
        month: _month!,
        onDaySelected: (d) => setState(() => _day = d),
      );
    }
    return DayFilesScreen(
      year: _year!,
      month: _month!,
      day: _day!,
      onPrevDay: () => _changeDay(-1),
      onNextDay: () => _changeDay(1),
      onDayJump: (d) => setState(() => _day = d),
    );
  }
}

class _Breadcrumb extends StatelessWidget {
  final String? year, month, day;
  final VoidCallback onTapRoot, onTapYear, onTapMonth;

  const _Breadcrumb({
    required this.year,
    required this.month,
    required this.day,
    required this.onTapRoot,
    required this.onTapYear,
    required this.onTapMonth,
  });

  @override
  Widget build(BuildContext context) {
    final segments = <Widget>[
      _seg('Coffre', year != null ? onTapRoot : null),
    ];
    if (year != null) {
      segments.add(_arrow());
      segments.add(_seg(year!, month != null ? onTapYear : null));
    }
    if (month != null) {
      segments.add(_arrow());
      segments.add(_seg(month!, day != null ? onTapMonth : null));
    }
    if (day != null) {
      segments.add(_arrow());
      segments.add(_seg(day!, null));
    }
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(children: segments),
    );
  }

  Widget _seg(String label, VoidCallback? onTap) {
    final isLink = onTap != null;
    return GestureDetector(
      onTap: onTap,
      child: Text(
        label,
        style: TextStyle(
          color: isLink ? const Color(0xFF9090A0) : const Color(0xFFE8A4B8),
          fontSize: 16,
          letterSpacing: 1,
          decoration: isLink ? TextDecoration.underline : null,
          decorationColor: const Color(0xFF6060A0),
        ),
      ),
    );
  }

  Widget _arrow() => const Padding(
        padding: EdgeInsets.symmetric(horizontal: 6),
        child: Text('›', style: TextStyle(color: Color(0xFF5A5A70), fontSize: 20)),
      );
}

class _SignInGate extends StatelessWidget {
  final VoidCallback onSignIn;
  final bool loading;

  const _SignInGate({required this.onSignIn, required this.loading});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0F1A),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.lock_outline, size: 64, color: Color(0xFFE8A4B8)),
            const SizedBox(height: 24),
            const Text(
              'Coffre',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w300,
                color: Color(0xFFE8E8F0),
                letterSpacing: 4,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Tes souvenirs en sécurité',
              style: TextStyle(color: Color(0xFF9090A0), fontSize: 14),
            ),
            const SizedBox(height: 48),
            if (loading)
              const CircularProgressIndicator(color: Color(0xFFE8A4B8))
            else
              ElevatedButton.icon(
                onPressed: onSignIn,
                icon: const Icon(Icons.login),
                label: const Text('Se connecter avec Google'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2A2A3E),
                  foregroundColor: const Color(0xFFE8A4B8),
                  padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: const BorderSide(color: Color(0xFFE8A4B8), width: 1),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
