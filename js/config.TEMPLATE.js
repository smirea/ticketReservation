var config = {
  client: {
    serverAddress: null,  // if null, it is set automatically in client
  },
  server: {
    port: 6969,
    saveInterval: 3 * 1000,
    backupInterval: 1 * 3600 * 1000
  },
  layout: {
    map: {
      'Y-O': '1-19',
      'N': '1-15',
      'M-F': '1-19',
      'E': '14-19',
      'D-A': '1-8,14-19'
    }
  }
};

var exports = exports || {};
exports.config = config;