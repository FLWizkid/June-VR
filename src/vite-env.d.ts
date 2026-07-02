/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILD_TIME__: string;

/**
 * Vite client types provide `import.meta.env` (DEV/PROD/MODE, etc.) and asset import handling.
 * This file is intentionally minimal; extend with `ImportMetaEnv` fields if custom env vars are
 * introduced.
 */
