'use strict';

// ws-scrcpy-web currently calls server.listen(port) without a host, which binds
// every network interface. RealTopia exposes it only through an SSH/dev-client
// tunnel, so force otherwise-unspecified TCP listeners onto server loopback.
// Existing explicit hosts (including scrcpy's own 127.0.0.1 sockets) remain
// unchanged. Unix-domain socket listeners are also left untouched.
const net = require('node:net');
const originalListen = net.Server.prototype.listen;

net.Server.prototype.listen = function realtopiaLoopbackListen(...args) {
  if (typeof args[0] === 'number') {
    const hasExplicitHost = typeof args[1] === 'string';
    if (!hasExplicitHost) args.splice(1, 0, '127.0.0.1');
  } else if (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    const options = args[0];
    if ('port' in options && !('host' in options)) args[0] = { ...options, host: '127.0.0.1' };
  }
  return originalListen.apply(this, args);
};
