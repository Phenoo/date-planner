import { setStringAsync } from "expo-clipboard";
import { File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";
import { openAuthSessionAsync } from "expo-web-browser";
import * as Location from "expo-location";
import { useEffect, useRef, useState } from "react";
import { Alert, BackHandler, Linking, Pressable, Share, StatusBar, StyleSheet, Text, View } from "react-native";
import { initialWindowMetrics, SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { browserScript, readBrowserMessage, type BrowserAction } from "./src/browser-bridge";
import { getAppCoordinates, type LocationResult } from "./src/location";
import { externalLink, getWebOrigin, isCheckout, isGoogleSignIn, readGoogleSignInReturn, readUrl, type Surface } from "./src/web-origin";

const origin = getWebOrigin(process.env.EXPO_PUBLIC_WEB_ORIGIN, __DEV__);
const firstPage = { uri: `${origin}/` };
const bootstrap = browserScript(origin);
const initialSurface: Surface = { color: "#fffaf7", dark: false, chat: false };
const errorSurface: Surface = { color: "#ffffff", dark: false, chat: false };

type NativeResult = { error?: string; code?: string } & Partial<LocationResult>;

async function runBrowserAction(action: Exclude<BrowserAction, { type: "location" }>): Promise<NativeResult | undefined> {
  if (action.type === "google") {
    const result = await openAuthSessionAsync(`${origin}/auth/native?session=${action.sessionId}`, "adateatlas://auth/google");
    const code = result.type === "success" ? readGoogleSignInReturn(result.url, action.sessionId) : null;
    return code ? { code } : { error: "AbortError" };
  }
  if (action.type === "copy") {
    if (!await setStringAsync(action.text)) throw new Error("Couldn't copy the link.");
    return;
  }
  if (action.type === "share") {
    const message = [action.text, action.url].filter(Boolean).join("\n");
    const result = await Share.share({ title: action.title, message });
    return result.action === Share.dismissedAction ? { error: "AbortError" } : undefined;
  }

  const file = new File(Paths.cache, "our-date.ics");
  file.create({ overwrite: true });
  try {
    file.write(action.calendar);
    await shareAsync(file.uri, { mimeType: "text/calendar", UTI: "com.apple.ical.ics" });
  } finally {
    file.delete();
  }
}

export default function App() {
  return <SafeAreaProvider initialMetrics={initialWindowMetrics}><DateAtlas /></SafeAreaProvider>;
}

function DateAtlas() {
  const browser = useRef<WebView>(null);
  const backAvailable = useRef(false);
  const lastPage = useRef(firstPage.uri);
  const busy = useRef(false);
  const locationController = useRef<AbortController | null>(null);
  const locationRequest = useRef<Promise<LocationResult> | null>(null);
  const [surface, setSurface] = useState(initialSurface);
  const [failed, setFailed] = useState(false);
  const [source, setSource] = useState(firstPage);

  useEffect(() => {
    const controller = new AbortController();
    locationController.current = controller;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!backAvailable.current || !browser.current) return false;
      browser.current.goBack();
      return true;
    });
    return () => { locationRequest.current = null; controller.abort(); subscription.remove(); };
  }, []);

  function openOutside(url: URL) {
    if (isGoogleSignIn(url)) {
      Alert.alert("Couldn't start Google sign-in", "Return to your account and try Continue with Google again.");
      return;
    }
    const destination = externalLink(url);
    if (!destination) return;
    void Linking.openURL(destination).catch(() => Alert.alert("Couldn’t open the link", "Try again in a moment."));
  }

  function onNewWindow(value: string) {
    const url = readUrl(value);
    if (!url) return;
    if (url.origin === origin && !url.pathname.startsWith("/__/auth/")) {
      browser.current?.injectJavaScript(`window.location.assign(${JSON.stringify(url.href)});true;`);
    } else {
      openOutside(url);
    }
  }

  function onMessage(data: string, url: string) {
    if (readUrl(url)?.origin !== origin) return;
    const message = readBrowserMessage(data);
    if (!message) return;
    if (message.type === "surface") {
      setSurface((previous) => previous.color === message.surface.color && previous.chat === message.surface.chat ? previous : message.surface);
      return;
    }

    const respond = (result?: NativeResult) => browser.current?.injectJavaScript(
      `window.dispatchEvent(new CustomEvent("dateatlas:native-result", {detail:${JSON.stringify({ id: message.id, ...result })}}));true;`,
    );
    if (message.type === "location") {
      const controller = locationController.current;
      if (!controller || controller.signal.aborted) { respond({ error: "AbortError" }); return; }
      if (!locationRequest.current) {
        const request = getAppCoordinates({
          requestForegroundPermissionsAsync: Location.requestForegroundPermissionsAsync,
          hasServicesEnabledAsync: Location.hasServicesEnabledAsync,
          watchPositionAsync: success => Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced }, success),
        }, controller.signal).finally(() => { if (locationRequest.current === request) locationRequest.current = null; });
        locationRequest.current = request;
      }
      void locationRequest.current.then(respond, () => respond({ error: "OperationError" }));
      return;
    }
    if (busy.current) { respond({ error: "AbortError" }); return; }
    busy.current = true;
    void runBrowserAction(message).then(respond, () => {
      respond({ error: "OperationError" });
      if (message.type === "calendar") Alert.alert("Couldn’t open the calendar file", "Try again in a moment.");
    }).finally(() => { busy.current = false; });
  }

  function retry() {
    backAvailable.current = false;
    setSource({ uri: lastPage.current });
    setFailed(false);
  }

  const chrome = failed ? errorSurface : surface;
  return <SafeAreaView edges={["top", "left", "right"]} style={[styles.fill, { backgroundColor: chrome.color }]}>
    <StatusBar barStyle={chrome.dark ? "light-content" : "dark-content"} />
    {failed ? <View style={styles.error}>
      <Text accessibilityRole="header" style={styles.heading}>Couldn’t load A Date At las</Text>
      <Text style={styles.description}>Check your connection and try again.</Text>
      <Pressable accessibilityRole="button" onPress={retry} style={styles.button}>
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
    </View> : <WebView
      ref={browser}
      source={source}
      style={styles.browser}
      originWhitelist={["*"]}
      onShouldStartLoadWithRequest={({ url, isTopFrame }) => {
        if (isTopFrame === false) return true;
        const next = readUrl(url);
        if (!next) return false;
      if (!isGoogleSignIn(next) && (next.origin === origin || isCheckout(next))) return true;
        openOutside(next);
        return false;
      }}
      onOpenWindow={({ nativeEvent }) => onNewWindow(nativeEvent.targetUrl)}
      onNavigationStateChange={({ canGoBack, url }) => {
        backAvailable.current = canGoBack;
        if (readUrl(url)?.origin === origin) lastPage.current = url;
      }}
      onFileDownload={({ nativeEvent: { downloadUrl } }) => {
        const url = readUrl(downloadUrl);
        if (url?.origin === origin && /^\/api\/invitations\/[^/]+\/calendar$/.test(url.pathname)) {
          browser.current?.injectJavaScript(`window.dispatchEvent(new CustomEvent("dateatlas:calendar", {detail:${JSON.stringify(url.href)}}));true;`);
        } else if (url) {
          openOutside(url);
        }
      }}
      onMessage={({ nativeEvent }) => onMessage(nativeEvent.data, nativeEvent.url)}
      injectedJavaScript={bootstrap}
      onError={() => setFailed(true)}
      onContentProcessDidTerminate={() => browser.current?.reload()}
      onRenderProcessGone={() => setFailed(true)}
      allowsBackForwardNavigationGestures
      allowsInlineMediaPlayback
      autoManageStatusBarEnabled={false}
      automaticallyAdjustContentInsets={false}
      contentInsetAdjustmentBehavior="never"
      geolocationEnabled
      mixedContentMode="never"
    />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  browser: { flex: 1, backgroundColor: "transparent" },
  error: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 12 },
  heading: { fontSize: 24, fontWeight: "600", color: "#261014", textAlign: "center" },
  description: { fontSize: 15, color: "#725d63", textAlign: "center" },
  button: { backgroundColor: "#d91335", borderRadius: 22, minHeight: 44, justifyContent: "center", paddingHorizontal: 24 },
  buttonText: { color: "#ffffff", fontWeight: "600", fontSize: 15 },
});
