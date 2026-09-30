// Presentation only; the server validates every entitlement.
export const isIOSApp = () => typeof navigator !== 'undefined' && /Picks777iOS\/1/.test(navigator.userAgent);
export const isStoreApp = () => isIOSApp();
