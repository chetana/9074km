# 9074km — Chet & Lys

Application couple cross-plateforme — double horloge, coffre à souvenirs privé, déployée en PWA web.

🌐 **Web (PWA)** : [chetlys.vercel.app](https://chetlys.vercel.app)
📱 **Android** : build local via `flutter run`

---

## Features

### Horloge · នាឡិកា
- **Double horloge** — heure en temps réel à Paris 🇫🇷 et Phnom Penh 🇰🇭, date en français
- **Status bilingue** — FR + Khmer : 🌙 dort · គេង / 🌅 se réveille · ភ្ញាក់ / ☀️ matinée · ព្រឹក / 🍽️ déjeuner · អាហារថ្ងៃ / ☀️ après-midi · រសៀល / 🌆 soirée · ល្ងាច / 🌙 bientôt au lit · ចូលគេង
- **Décalage horaire dynamique** — calculé depuis les offsets de timezone réels
- **Distance** — 9 074 km affichés entre les deux cards
- **PWA installable** — Lys peut l'ajouter à son écran d'accueil iPhone depuis Safari

### Coffre · ប្រអប់
- **Auth Google** — connexion avec compte Google, `disconnect()` à la déconnexion → sélecteur de compte complet garanti
- **Breadcrumb cliquable** — `Coffre › 2026 › 02 › 22`, chaque niveau est tappable pour remonter
- **Icône calendrier** — dans l'AppBar, ouvre un date picker pour sauter directement à n'importe quelle date (utile pour uploader dans une date passée)
- **Flèches `< >`** — navigation jour par jour en haut de DayFilesScreen
- **Chips des jours** — bandeau horizontal scrollable montrant uniquement les jours avec du contenu dans le mois courant, chip actif mis en évidence
- **Bouton "Aujourd'hui · ថ្ងៃនេះ"** — accès direct au jour courant depuis la liste des années
- **Upload de photos/vidéos** — via signed URL GCS PUT direct (pas de proxy serveur)
- **Grille de miniatures** — aperçu immédiat après upload, rechargement automatique au changement de date
- **Viewer plein écran** — tap sur une image → pinch-to-zoom / tap sur une vidéo → lecteur avec play/pause, seek bar, plein écran (Chewie)
- **Suppression** — long press sur une miniature → confirmation → suppression GCS
- **Labels bilingues** — mois : `01 — Janvier · មករា` / jours : `2026/02/22 — Dimanche · អាទិត្យ`
- **Seuls les dates avec contenu** sont affichées dans les listes et les chips (issues de GCS, pas de DB)

---

## Architecture

```
lib/
├── main.dart                  # ChetLysApp + HomeScreen (BottomNav)
│
├── coffre/
│   ├── auth_service.dart      # GoogleSignIn singleton — signIn / disconnect / idToken
│   ├── coffre_api.dart        # Appels REST chetana.dev/api/coffre/*
│   ├── coffre_screen.dart     # Auth gate + état navigation + breadcrumb
│   ├── year_list.dart         # Liste des années (YearListBody)
│   ├── month_list.dart        # Liste des mois — "01 — Janvier · មករា"
│   ├── day_list.dart          # Liste des jours — "2026/01/22 — Lundi · ចន្ទ"
│   └── day_files.dart         # Grille fichiers + chips jours + nav arrows + upload FAB + viewer (image/vidéo)
│
└── [ClockScreen dans main.dart]
```

```
Navigation Coffre (state-based, pas de Navigator.push) :

CoffreScreen
├── _year == null      → YearListBody
├── _month == null     → MonthListBody(year)
├── _day == null       → DayListBody(year, month)
└── else               → DayFilesScreen(year, month, day)

AppBar (persistant) :
  [breadcrumb cliquable]  Coffre › 2026 › 02 › 22  [📅 date picker] [logout]

DayFilesScreen :
  [< prev]  Dimanche · អាទិត្យ  Jan 22  [next >]
  [ 21 ]  [ 22 ★ ]  [ 25 ]  [ 28 ]   ← chips jours existants (scroll horizontal)
```

```
Upload flow :

FAB "+" → FilePicker.pickFiles(type: FileType.media)
       → POST /api/coffre/sign-upload { path, contentType }
       → PUT <signed_url> avec bytes (http.put direct vers GCS)
       → listObjects() refresh
```

---

## Backend (chetana.dev)

Les appels API coffre vont vers `https://chetana.dev/api/coffre/` :

| Endpoint | Méthode | Description |
|---|---|---|
| `/api/coffre/list?prefix=` | GET | Liste les objets GCS avec délimiteur `/` |
| `/api/coffre/sign-upload` | POST | Génère un signed URL PUT (15 min) |
| `/api/coffre/sign-download?path=` | GET | Génère un signed URL GET (1h) |
| `/api/coffre/delete?path=` | DELETE | Supprime un objet GCS |

Tous les endpoints requièrent `Authorization: Bearer <google_id_token>`.

---

## Tech Stack

| Layer | Technologie |
|-------|------------|
| Langage | Dart |
| Framework | Flutter 3 (stable) |
| Auth | google_sign_in ^6.2.2 (web clientId) |
| Upload | file_picker ^8.1.4 + http ^1.2.2 |
| Timezones | `timezone: ^0.10.0` |
| Stockage | Google Cloud Storage (bucket `chet-lys-coffre`) |
| Cible Web | PWA — Chrome, Safari, Firefox |
| Hébergement web | Vercel (static, outputDirectory: build/web) |
| Gestionnaire Flutter | [Puro](https://puro.dev) |

---

## Build & Run

### Web (dev)

```bash
flutter run -d chrome
```

### Web (production → Vercel)

```bash
flutter build web --release
vercel --prod
```

> **Note** : `build/web` est commité dans le repo (le seul sous-dossier de `build/` non ignoré) car Vercel ne peut pas installer Flutter pour compiler côté serveur. Lors de chaque mise à jour, rebuilder puis `vercel --prod`.

### Android

```bash
# Connecter le téléphone (filaire ou sans fil)
adb pair <ip>:<pair-port>   # entrer le code à 6 chiffres
adb connect <ip>:<port>     # port affiché sur l'écran principal

# Lancer en mode debug
flutter run -d <device-id>
```

---

## Variables d'environnement (backend chetana-cv)

| Variable | Description |
|---|---|
| `GCS_BUCKET_NAME` | Nom du bucket GCS (`chet-lys-coffre`) |
| `GCS_SERVICE_ACCOUNT_JSON` | JSON du service account (Storage Object Admin) stringifié |

---

## Documentation

- [Architecture](docs/architecture.md) — Structure du code et flux de données
- [Choix techniques](docs/technical-choices.md) — Pourquoi Flutter, pourquoi Vercel

---

## License

Projet privé — Chet & Lys.
