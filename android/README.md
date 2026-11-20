# 香城模擬器 Android app（TWA）

The Android app is a **Trusted Web Activity**: a small APK that opens the browser version
(`https://heung-shing-play.nortonyuen.workers.dev/`) in Chrome, full screen. The game itself is the
web build, so every release of the web version reaches the app without a new APK; the APK is rebuilt
with each release only to carry its version number.

- Package: `io.github.nortonyuen_oss.heungshing` (permanent: a different package is a different app)
- Android 7 (API 24) or later, with Chrome (or another browser that supports TWAs)
- Saves live in Chrome's storage for the site, shared with the browser version in Chrome
- Built with Google's [android-browser-helper](https://github.com/GoogleChrome/android-browser-helper)

## Full screen needs Digital Asset Links

Chrome opens the app without a URL bar only while the site vouches for the app's package and signing
key. `android/assetlinks.json` holds that statement; the web Worker (`web-fallback.mjs`) serves it at
`/.well-known/assetlinks.json`, and `scripts/verify-published-web.js` checks it after every deploy. If
the key ever changes, its SHA-256 fingerprint must change here too, or the app shows a URL bar.

## The signing key

The release key is **not** in this repository. On Norton's Mac it is in
`~/.heung-shing-android/keystore/` (`heungshing-release.jks` and `passwords.env`).
**Back that folder up somewhere safe** (a password manager or an external drive): an app signed with a
lost key can never be updated, and Chrome would stop trusting a new key until `assetlinks.json` is
changed.

CI signs the APK from four GitHub Actions secrets. To set them (once), from the repository root:

```sh
K=~/.heung-shing-android/keystore
set -a; . "$K/passwords.env"; set +a
base64 -i "$K/heungshing-release.jks" | tr -d '\n' | gh secret set ANDROID_KEYSTORE_BASE64
printf '%s' "$ANDROID_KEYSTORE_PASSWORD" | gh secret set ANDROID_KEYSTORE_PASSWORD
printf '%s' "$ANDROID_KEY_PASSWORD" | gh secret set ANDROID_KEY_PASSWORD
printf '%s' "$ANDROID_KEY_ALIAS" | gh secret set ANDROID_KEY_ALIAS
```

## Building it locally

Needs JDK 17 and the Android SDK (platform 35). On Norton's Mac:

```sh
export JAVA_HOME=~/.heung-shing-android/jdk17/Contents/Home ANDROID_HOME=~/Library/Android/sdk
set -a; . ~/.heung-shing-android/keystore/passwords.env; set +a
export ANDROID_KEYSTORE=~/.heung-shing-android/keystore/heungshing-release.jks
(cd android/twa && ./gradlew assembleRelease)
# -> android/twa/app/build/outputs/apk/release/app-release.apk
```

Icons and the splash image come from `build/icon.png` (`python3 android/make-icons.py`).

## Trying it without an Android phone

An emulator with Chrome (`system-images;android-34;google_apis_playstore;x86_64`, AVD
`heungshing_api34`):

```sh
~/Library/Android/sdk/emulator/emulator -avd heungshing_api34 &
~/Library/Android/sdk/platform-tools/adb install -r android/twa/app/build/outputs/apk/release/app-release.apk
```

Open Chrome once first on a fresh emulator: until its first-run screen is done, the app waits on its
splash screen.

## In the release

The `android` job in `.github/workflows/build-installers.yml` builds and signs
`The.City.of.Heung.Shing-<version>-android.apk`, checks it is signed with the key in
`assetlinks.json`, and the release job attaches it to the GitHub release; the official site's Android
card links it (`docs/site.js`, `docs/web-play.js`).
