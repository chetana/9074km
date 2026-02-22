import 'package:google_sign_in/google_sign_in.dart';

class AuthService {
  AuthService._();
  static final AuthService instance = AuthService._();

  final _googleSignIn = GoogleSignIn(
    clientId: '267131866578-m6rua7ccatqno7lp0t0jscsrvsf69u4f.apps.googleusercontent.com',
    scopes: ['email', 'openid', 'profile'],
  );

  GoogleSignInAccount? get currentUser => _googleSignIn.currentUser;

  Future<GoogleSignInAccount?> signIn() async {
    try {
      final account = await _googleSignIn.signIn();
      return account;
    } catch (_) {
      return null;
    }
  }

  /// disconnect() révoque les tokens et force le sélecteur de compte au prochain signIn().
  Future<void> signOut() => _googleSignIn.disconnect();

  Future<String?> idToken() async {
    final user = _googleSignIn.currentUser ?? await _googleSignIn.signInSilently();
    if (user == null) return null;
    final auth = await user.authentication;
    return auth.idToken;
  }
}
