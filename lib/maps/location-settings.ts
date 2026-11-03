type LocationSettingsGuide = {
  id: string;
  label: string;
  steps: readonly string[];
  helpUrl?: string;
};

export const locationSettingsGuides: readonly LocationSettingsGuide[] = [
  {
    id: "other",
    label: "Another browser",
    steps: [
      "Open the site controls beside your browser’s address bar. Find Location in this site’s permissions and allow access.",
      "If location is also off on your device, open its Settings, turn on Location Services and allow your browser to use it.",
    ],
  },
  {
    id: "ios",
    label: "iPhone or iPad · Safari",
    steps: [
      "In Safari, tap the page menu beside the address bar → Website Settings → Location → Allow.",
      "If it is still blocked, open your device’s Settings → Privacy & Security → Location Services. Turn it on, then select Safari Websites and allow access while using the app.",
    ],
    helpUrl: "https://support.apple.com/guide/iphone/iphb01fc3c85/ios",
  },
  {
    id: "ios-chrome",
    label: "iPhone or iPad · Chrome",
    steps: [
      "Open your device’s Settings and find Chrome (under Apps on newer versions). Tap Location and allow access while using the app.",
      "If Location Services is off, turn it on in Settings → Privacy & Security → Location Services.",
    ],
    helpUrl: "https://support.google.com/chrome/answer/142065?co=GENIE.Platform%3DiOS&hl=en",
  },
  {
    id: "android",
    label: "Android",
    steps: [
      "In Chrome, tap the site information icon beside the address bar → Permissions → Location and allow access. In another browser, check this site’s location permission in its site settings.",
      "If it is still blocked, turn on Location in your device’s Settings. Under App location permissions, select your browser and allow access while using it. Menu names vary by phone.",
    ],
    helpUrl: "https://support.google.com/chrome/answer/142065?co=GENIE.Platform%3DAndroid&hl=en",
  },
  {
    id: "chrome",
    label: "Computer · Chrome",
    steps: [
      "Click the site controls beside the address bar → Site settings → Location → Allow for this site.",
      "If your computer also blocks location, open its system settings and allow Chrome under Location Services or Location permissions.",
    ],
    helpUrl: "https://support.google.com/chrome/answer/142065?co=GENIE.Platform%3DDesktop&hl=en",
  },
  {
    id: "safari",
    label: "Mac · Safari",
    steps: [
      "Choose Safari → Settings → Websites → Location. Find this website and choose Allow.",
      "If it is still blocked, open System Settings → Privacy & Security → Location Services. Turn it on and allow Safari Websites.",
    ],
    helpUrl: "https://support.apple.com/guide/safari/customize-settings-per-website-ibrw7f78f7fe/mac",
  },
  {
    id: "firefox",
    label: "Computer · Firefox",
    steps: [
      "Open Firefox’s Settings → Privacy & Security → Permissions → Location → Settings. Remove this site’s blocked permission and save the change.",
      "Return here and try again, then choose Allow when Firefox asks. Also check your device’s Location Services if access is still blocked.",
    ],
    helpUrl: "https://support.mozilla.org/en-US/kb/does-firefox-share-my-location-websites",
  },
];

export function locationSettingsGuide(userAgent: string, maxTouchPoints = 0) {
  const ios = /iPad|iPhone|iPod/i.test(userAgent) || /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
  let id = "other";
  if (ios) {
    if (/CriOS/i.test(userAgent)) id = "ios-chrome";
    else if (/Version\/.*Safari\//i.test(userAgent) && !/FxiOS|EdgiOS|OPiOS/i.test(userAgent)) id = "ios";
  } else if (/Android/i.test(userAgent)) id = "android";
  else if (/Firefox\//i.test(userAgent)) id = "firefox";
  else if (!/Edg|OPR|SamsungBrowser/i.test(userAgent)) {
    if (/Chrome\//i.test(userAgent)) id = "chrome";
    else if (/Safari\//i.test(userAgent) && /Macintosh/i.test(userAgent)) id = "safari";
  }
  return locationSettingsGuides.find((guide) => guide.id === id) ?? locationSettingsGuides[0];
}
