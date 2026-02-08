const STORAGE_KEY = "analytics-consent";

type ConsentValue = "granted" | "denied";

export function getConsentPreference(): ConsentValue | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "granted" || value === "denied") {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

export function setConsentPreference(value: ConsentValue): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // localStorage unavailable (e.g. private browsing)
  }
}

export function updateGtagConsent(analyticsStorage: ConsentValue): void {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("consent", "update", {
      analytics_storage: analyticsStorage,
    });
  }
}
