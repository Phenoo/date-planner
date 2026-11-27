# A Date At las for iOS and Android

The Expo app displays the responsive A Date At las website. The website owns the DM Sans typography, colours, layouts, navigation, onboarding, planner, and animations. The mobile app handles the operating system’s back gesture, links, share sheet, clipboard, and calendar files.

## Run locally

Use the repository’s Node 24 LTS version.

```sh
cd mobile
npm ci
npm run ios
```

Run `npm run android` with the Android SDK for Android. Both builds use `https://adateatlas.com` by default. To point a build at an HTTPS preview, set `EXPO_PUBLIC_WEB_ORIGIN` in `mobile/.env.local` and restart Metro. The website supplies its own Firebase configuration.

After changing the launcher artwork or iOS build number, run `npx expo prebuild --platform ios --no-install` from `mobile/` before archiving in Xcode. This updates the generated asset catalog and bundle metadata from the Expo configuration.

Google sign-in uses a system authentication browser and returns to the app through its `adateatlas` URL scheme. A five-minute, single-use exchange with a verifier kept inside the app transfers the Firebase session without putting tokens in the callback URL. Existing guest plans use the normal account-transfer flow. Email and password sign-in stays inside the app.

Rebuild the native app after installing `expo-web-browser` and `expo-location`. Deploy the website’s native-auth page and API together, and deploy the Firestore TTL configuration for `nativeAuthSessions`. Older app builds keep Google hidden until they support the return flow.

Home requests foreground location permission and searches near the device’s coordinates. Location updates stop after the first fix, cancellation or timeout. Denial keeps manual city search available. Coordinates remain in view memory and are not saved. All app screens omit the bottom safe-area inset while retaining top and side insets. The mobile home omits the logo header and footer links; planner controls remain available.

## Isolated review

Start the project’s `demo-date-atlas` Firebase Auth and Firestore emulators and run `npm run dev:demo` from the repository root. In `mobile/.env.development.local`, set `EXPO_PUBLIC_WEB_ORIGIN=http://127.0.0.1:3004`. On Android, use ADB reverse for ports `3004` and `9099` so the web app and Auth emulator remain on loopback. Restart Metro and reopen the app. Remove the development override to return to the configured site.

Run `npm run typecheck`, `npm test`, and `npm run export` from `mobile/` to check the app and generate both platform bundles.
