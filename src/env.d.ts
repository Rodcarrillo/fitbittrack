interface ImportMetaEnv {
  readonly VITE_DATA_PROVIDER?: 'sample' | 'google';
  readonly VITE_API_BASE?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
declare module '*.css';
declare module '*.png' { const src: string; export default src; }
