// Local development is silent by default. Use ?debug=1 on other hosts;
// opt into audio testing with ?audio=1 (does not change saved sound settings).
export function debugOptions(location = globalThis.location) {
  const params = new URLSearchParams(location?.search || '');
  const host = location?.hostname || '';
  const local = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host) || host.endsWith('.localhost');
  const debug = params.has('debug') ? params.get('debug') !== '0' : local;
  return { debug, silent: debug && params.get('audio') !== '1' };
}
export const { debug: DEBUG, silent: SILENT_DEBUG } = debugOptions();
