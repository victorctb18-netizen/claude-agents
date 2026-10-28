export type Gravando = boolean

declare module 'claude-code' {
  interface PluginState {
    'contexto-bar': { gravando: Gravando }
  }
}
