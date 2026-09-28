// Compatibility entry point. The maintained Web and extension checks use isolated mocked networking.
await import("./check-web-experience.mjs");
await import("./check-extension.mjs");
