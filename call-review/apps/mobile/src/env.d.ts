// Expo inlines EXPO_PUBLIC_* variables at build time; only these are readable in the app.
declare const process: {
  env: {
    EXPO_PUBLIC_CALL_REVIEW_API_BASE_URL?: string;
  };
};
