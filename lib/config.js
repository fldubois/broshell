'use strict';

var options = require('commander');

options.version(require('../package.json').version)
  .option('-p, --port [port]', 'Listening port for client connection [8080]', 8080)
  .option('-x, --bin [path]', 'Path to native shell binaries [/bin/bash]', '/bin/bash')
  .option('-H, --history [path]', 'Path to history save file [~/.broshell_history]', process.env.HOME + '/.broshell_history')
  .option('-u, --uid [uid]', 'User identity of the bash process [node process uid]', process.getuid())
  .option('-g, --gid [gid]', 'Group identity of the bash process [node process gid]', process.getgid())
  .option('-P, --path [path]', 'Startup working directory [current directory]', process.cwd())
  .option('-l, --logs [path]', 'Logs directory [/var/log/broshell]', '/var/log/broshell')
  .option('-v, --verbose', 'Enable verbose logging')
  .parse(process.argv);

module.exports = {
  get: function (key) {
    return options[key];
  }
}
