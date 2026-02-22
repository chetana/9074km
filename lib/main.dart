import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:timezone/data/latest.dart' as tz_data;
import 'coffre/coffre_screen.dart';

/// Date de la bague — début officiel de notre histoire 💍
const _coupleStartDate = DateTime(2026, 1, 13);

void main() {
  tz_data.initializeTimeZones();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
  ));
  runApp(const ChetLysApp());
}

class ChetLysApp extends StatelessWidget {
  const ChetLysApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Chet & Lys',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0F0F1A),
        fontFamily: 'sans-serif',
      ),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _index = 0;
  final _screens = const [ClockScreen(), CoffreScreen()];

  @override
  Widget build(BuildContext context) => Scaffold(
        body: _screens[_index],
        bottomNavigationBar: BottomNavigationBar(
          currentIndex: _index,
          onTap: (i) => setState(() => _index = i),
          backgroundColor: const Color(0xFF0F0F1A),
          selectedItemColor: const Color(0xFFE8A4B8),
          unselectedItemColor: const Color(0xFF9090A0),
          items: const [
            BottomNavigationBarItem(
              icon: Icon(Icons.access_time),
              label: 'Horloge · នាឡិកា',
            ),
            BottomNavigationBarItem(
              icon: Icon(Icons.photo_library),
              label: 'Coffre · ប្រអប់',
            ),
          ],
        ),
      );
}

class ClockScreen extends StatefulWidget {
  const ClockScreen({super.key});

  @override
  State<ClockScreen> createState() => _ClockScreenState();
}

class _ClockScreenState extends State<ClockScreen> {
  late Timer _timer;
  late DateTime _now;

  @override
  void initState() {
    super.initState();
    _now = DateTime.now().toUtc();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() => _now = DateTime.now().toUtc());
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  tz.TZDateTime _timeIn(String zone) {
    return tz.TZDateTime.now(tz.getLocation(zone));
  }

  @override
  Widget build(BuildContext context) {
    final paris = _timeIn('Europe/Paris');
    final phnomPenh = _timeIn('Asia/Phnom_Penh');

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF0F0F1A), Color(0xFF1A1025)],
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Header
                const Text(
                  '♡',
                  style: TextStyle(fontSize: 32, color: Color(0xFFE8A4B8)),
                ),
                const SizedBox(height: 4),
                const Text(
                  'Chet & Lys',
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w300,
                    color: Color(0xFFE8E8F0),
                    letterSpacing: 4,
                  ),
                ),
                const SizedBox(height: 48),

                // France card
                _ClockCard(
                  name: 'Chet',
                  city: 'Paris',
                  flag: '🇫🇷',
                  time: paris,
                  color: const Color(0xFF4A90D9),
                ),

                const SizedBox(height: 16),

                // Distance indicator
                _DistanceIndicator(paris: paris, phnomPenh: phnomPenh),

                const SizedBox(height: 8),

                // Compteur jours ensemble
                _DaysTogetherBadge(now: paris.toDateTime()),

                const SizedBox(height: 8),

                // Cambodia card
                _ClockCard(
                  name: 'Lys',
                  city: 'Phnom Penh',
                  flag: '🇰🇭',
                  time: phnomPenh,
                  color: const Color(0xFFE8A4B8),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ClockCard extends StatelessWidget {
  final String name;
  final String city;
  final String flag;
  final tz.TZDateTime time;
  final Color color;

  const _ClockCard({
    required this.name,
    required this.city,
    required this.flag,
    required this.time,
    required this.color,
  });

  String get _timeStr {
    final h = time.hour.toString().padLeft(2, '0');
    final m = time.minute.toString().padLeft(2, '0');
    final s = time.second.toString().padLeft(2, '0');
    return '$h:$m:$s';
  }

  String get _dateStr {
    const months = [
      'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'
    ];
    const days = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
    final day = days[time.weekday - 1];
    final month = months[time.month - 1];
    return '$day ${time.day} $month';
  }

  String get _status {
    final h = time.hour;
    if (h >= 0 && h < 6) return '🌙 dort · គេង';
    if (h >= 6 && h < 9) return '🌅 se réveille · ភ្ញាក់';
    if (h >= 9 && h < 12) return '☀️ matinée · ព្រឹក';
    if (h >= 12 && h < 14) return '🍽️ déjeuner · អាហារថ្ងៃ';
    if (h >= 14 && h < 18) return '☀️ après-midi · រសៀល';
    if (h >= 18 && h < 21) return '🌆 soirée · ល្ងាច';
    if (h >= 21 && h < 23) return '🌙 bientôt au lit · ចូលគេង';
    return '🌙 dort · គេង';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: const Color(0xFF1E1E30),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.3), width: 1),
        boxShadow: [
          BoxShadow(
            color: color.withOpacity(0.08),
            blurRadius: 20,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Left: flag + name
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(flag, style: const TextStyle(fontSize: 36)),
              const SizedBox(height: 6),
              Text(
                name,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w600,
                  color: color,
                  letterSpacing: 1,
                ),
              ),
              Text(
                city,
                style: TextStyle(
                  fontSize: 12,
                  color: color.withOpacity(0.7),
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),

          const Spacer(),

          // Right: time + date + status
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                _timeStr,
                style: const TextStyle(
                  fontSize: 36,
                  fontWeight: FontWeight.w200,
                  color: Color(0xFFF0F0FF),
                  letterSpacing: 2,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
              const SizedBox(height: 4),
              Text(
                _dateStr,
                style: const TextStyle(
                  fontSize: 12,
                  color: Color(0xFF9090A0),
                ),
              ),
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  _status,
                  style: TextStyle(fontSize: 12, color: color),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DaysTogetherBadge extends StatelessWidget {
  final DateTime now;
  const _DaysTogetherBadge({required this.now});

  @override
  Widget build(BuildContext context) {
    final start = DateTime(
        _coupleStartDate.year, _coupleStartDate.month, _coupleStartDate.day);
    final today = DateTime(now.year, now.month, now.day);
    final days = today.difference(start).inDays;
    if (days < 0) return const SizedBox.shrink();
    return Text(
      '💍 Jour $days ensemble · ថ្ងៃទី $days',
      style: const TextStyle(
        fontSize: 12,
        color: Color(0xFFE8A4B8),
        letterSpacing: 0.5,
      ),
    );
  }
}

class _DistanceIndicator extends StatelessWidget {
  final tz.TZDateTime paris;
  final tz.TZDateTime phnomPenh;

  const _DistanceIndicator({required this.paris, required this.phnomPenh});

  String get _timeDiff {
    final diffHours = (phnomPenh.timeZoneOffset - paris.timeZoneOffset).inHours;
    return diffHours > 0 ? '+${diffHours}h' : '${diffHours}h';
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Divider(color: Colors.white.withOpacity(0.1))),
        const SizedBox(width: 12),
        Column(
          children: [
            Text(
              '9 074 km',
              style: TextStyle(
                fontSize: 11,
                color: Colors.white.withOpacity(0.3),
                letterSpacing: 1,
              ),
            ),
            Text(
              _timeDiff,
              style: const TextStyle(
                fontSize: 13,
                color: Color(0xFF9090A0),
                letterSpacing: 1,
              ),
            ),
          ],
        ),
        const SizedBox(width: 12),
        Expanded(child: Divider(color: Colors.white.withOpacity(0.1))),
      ],
    );
  }
}
