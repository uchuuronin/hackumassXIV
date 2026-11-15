import { defineConfig } from 'wxt';

// Fixed extension ID: ifacloijdkldongodjgeccgmlodnogeg
// The relay accepts only this ID. Do not change `key` without telling B.
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Milo',
    description: 'A steadier, easier web for older adults and people with tremor.',
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu6uO17RyL3SBpCaNwJbW+XQtktZH2Q7IpntbK2imYjOnkBifetdJLrS8XHxgyRGoBz6opwYlENbcbn/c4FzSsF0M+4BI4VzjuaMzx1ONR+dMope08JQ9/KAuzEQ7Jeb9XYo/B7jp+6gGmvQwKXNjcWO0v2F7as0DgZB/coQXYfqzqSWO7kxterX/xzCf2TOQ566uAHT7Zlvr/kMAdn912c0INjVo6uhF5l0XfJk+IgOzMfmMNCFfZNVDNFuUqhEfGlCLYXJ4Gp9FMfoLMYwN225YYfxrIHe5cYKtMGixRKvEXtBopfx2P8n7arhvmDD1WtXu/4AP/Ru3q+3dhJt4RQIDAQAB',
    permissions: [
      'sidePanel',
      'storage',
      'unlimitedStorage',
      'scripting',
      'tabs',
      'activeTab',
      'tts',
      'offscreen',
      'alarms',
    ],
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Open Milo' },
    // A way in without the mouse (guide lane, C). The background worker opens the panel when it is pressed.
    // Chrome lets a person change the key at chrome://extensions/shortcuts.
    commands: {
      'open-steady': { suggested_key: { default: 'Alt+M', mac: 'Alt+M' }, description: 'Open Milo' },
    },
  },
});
