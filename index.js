'use strict';

process.name = 'broshell';

var crypto = require('crypto');
var fs     = require('fs');
var http   = require('http');
var path   = require('path');
var spawn  = require('child_process').spawn;

var express = require('express');
var options = require('commander');
var winston = require('winston');

options.version(require('./package.json').version)
  .option('-p, --port [port]', 'Listening port for client connection [8080]', 8080)
  .option('-x, --bin [path]', 'Path to native shell binaries [/bin/bash]', '/bin/bash')
  .option('-H, --history [path]', 'Path to history save file [~/.broshell_history]', process.env.HOME + '/.broshell_history')
  .option('-u, --uid [uid]', 'User identity of the bash process [node process uid]', process.getuid())
  .option('-g, --gid [gid]', 'Group identity of the bash process [node process gid]', process.getgid())
  .option('-P, --path [path]', 'Startup working directory [current directory]', process.cwd())
  .option('-l, --logs [path]', 'Logs directory [current directory]', '/var/log/broshell')
  .option('-v, --verbose', 'Enable verbose logging')
  .parse(process.argv);

try {
  fs.mkdirSync(options.logs);
} catch (err) {
  if (err.code !== 'EEXIST') {
    throw err;
  }
}

var logger = new winston.Logger({
  transports: [
    new winston.transports.Console({
      level: options.verbose ? 'verbose' : 'info',
      colorize: true,
      timestamp: true
    }),
    new winston.transports.File({
      filename: path.join(options.logs, 'broshell.log'),
      level: 'verbose',
      timestamp: true
    })
  ]
});

var app = express();

app.use(express.static('public'));

var server = app.listen(options.port, function () {
  logger.info('Broshell listening on port ' + options.port);
});

var shasum = crypto.createHash('sha1');
shasum.update('boundary-' + Math.random());
var token = shasum.digest('hex');

var boundary = ' echo "' + token + JSON.stringify({
  username: "`whoami`",
  hostname: "`hostname`",
  cwd: "`pwd`"
}).replace(/"/g, '\\"') + '"\n';

var resetHistoryIndex = ' HISTINDEX=0;';

/**
 * Generate a 4 characters short ID
 * @see http://stackoverflow.com/a/6248722
 *
 * @return A 4 characters short ID (String)
 */
function generateShortID() {
    return ('0000' + (Math.random() * Math.pow(36,4) << 0).toString(36)).slice(-4)
}

// Socket.io server

var io = require('socket.io')(server);

io.on('connection', function (socket) {
  var session = generateShortID();

  logger.info('Connection from ' + socket.request.connection.remoteAddress, {session: session});

  var bash = spawn(options.bin, [], {
    uid: +options.uid,
    gid: +options.gid,
    cwd: options.path,
    env: {
      HISTFILE: options.history,
      HISTFILESIZE: 500,
      HISTSIZE: 500,
      HISTCONTROL: 'ignorespace',
      HISTINDEX: 0,
      SHELLOPTS: 'history:histexpand'
    }
  });
  var cb;

  bash.stdout.on('data', function (data) {
    data.toString().replace(/(\n)*$/, '').split('\n').forEach(function (line) {
      if (line.indexOf(token) === 0) {
        if (typeof cb === 'function') {
          cb = null;
        } else {
          var context = JSON.parse(line.replace(token, ''));
          logger.verbose('[context]', JSON.stringify(context), {session: session});
          socket.emit('context', context);
        }
      } else {
        logger.info('[stdout]', line, {session: session});

        if (typeof cb === 'function') {
          cb(line);
        } else {
          socket.emit('stdout', line);
        }
      }
    });
  });

  bash.stderr.on('data', function (data) {
    data.toString().replace(/(\n)*$/, '').split('\n').forEach(function (line) {
      logger.info('[stderr]', line, {session: session});
      socket.emit('stderr', line);
    });
  });

  bash.stdin.on('error', function (err) {
    if (err.code !== 'ECONNRESET') {
      throw err;
    }
  });

  bash.on('close', function (code) {
    logger.info('[close]', code, {session: session});
    socket.emit('close', code);
  });

  socket.on('cmd', function (cmd) {
    logger.info('[cmd]', cmd.replace(/(\n)*$/, ''), {session: session});
    bash.stdin.write(cmd.replace(/(\n)*$/, '\n') + resetHistoryIndex + boundary);
  });

  socket.on('interrupt', function () {
    logger.info('[interrupt]', {session: session});
    spawn('pkill', ['-P', bash.pid]);
  });

  socket.on('history', function (direction, callback) {
    logger.verbose('[history]', direction, {session: session});
    cb = callback;

    if (direction < 0) {
      var histsize = '$(history | tail -n 1 | awk -F "[[:space:]]+" \'{print $2}\')';
      var cmd = 'HISTINDEX=$((HISTINDEX-1>-' + histsize + '?$HISTINDEX-1:-' + histsize +'));'
    } else {
      var cmd = 'HISTINDEX=$((HISTINDEX+1<-1?$HISTINDEX+1:-1));'
    }

    bash.stdin.write(' ' + cmd + 'fc -l $HISTINDEX $HISTINDEX | sed -e "s/^[0-9]\\+\\t\\?\\s\\?//"\n' + boundary);
  });

  socket.on('disconnect', function () {
    logger.info('Disconnection from ' + socket.request.connection.remoteAddress, {session: session});

    if (bash.connected) {
      bash.stdin.write(' history -a\n');
    }
  });

  bash.stdin.write(boundary);
});
