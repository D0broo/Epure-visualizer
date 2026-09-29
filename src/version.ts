/**
 * Версія програми. Значення підставляється з `package.json` через `define`
 * у `vite.config.ts`, тож показник в інтерфейсі не може розійтися з файлом.
 */
declare const __APP_VERSION__: string

export const APP_VERSION = __APP_VERSION__
