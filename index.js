'use strict';

process.name = 'broshell';

var crypto = require('crypto');
var http   = require('http');
var spawn  = require('child_process').spawn;

var express = require('express');
var mkdirp  = require('mkdirp');

var config = require('./lib/config.js');
var logger = require('./lib/logger.js');

try {
  mkdirp.sync(config.get('logs'));
} catch (err) {
  if (err.code !== 'EEXIST') {
    throw err;
  }
}

var app = express();

app.use(express.static('public'));

var server = app.listen(config.get('port'), function () {
  logger.global().info('Broshell listening on port ' + config.get('port'));
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

  logger.session(session).info('Connection from ' + socket.request.connection.remoteAddress, {session: session});

  var bash = spawn(config.get('bin'), [], {
    uid: +config.get('uid'),
    gid: +config.get('gid'),
    cwd: config.get('path'),
    env: {
      HISTFILE: config.get('history'),
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
          logger.session(session).verbose('[context]', JSON.stringify(context), {session: session});
          socket.emit('context', context);
        }
      } else {
        logger.session(session).info('[stdout]', line, {session: session});

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
      logger.session(session).info('[stderr]', line, {session: session});
      socket.emit('stderr', line);
    });
  });

  bash.stdin.on('error', function (err) {
    if (err.code !== 'ECONNRESET') {
      throw err;
    }
  });

  bash.on('close', function (code) {
    logger.session(session).info('[close]', code, {session: session});
    socket.emit('close', code);
  });

  socket.on('cmd', function (cmd) {
    logger.session(session).info('[cmd]', cmd.replace(/(\n)*$/, ''), {session: session});
    bash.stdin.write(cmd.replace(/(\n)*$/, '\n') + resetHistoryIndex + boundary);
  });

  socket.on('interrupt', function () {
    logger.session(session).info('[interrupt]', {session: session});
    spawn('pkill', ['-P', bash.pid]);
  });

  socket.on('history', function (direction, callback) {
    logger.session(session).verbose('[history]', direction, {session: session});
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
    logger.session(session).info('Disconnection from ' + socket.request.connection.remoteAddress, {session: session});

    if (bash.connected) {
      bash.stdin.write(' history -a\n');
    }
  });

  bash.stdin.write(boundary);
});

process.on('exit', function (code) {
  logger.global().info('Exiting with code : ' + code);
});

process.on('SIGINT', function (err) {
  logger.global().info('SIGINT signal received');
  process.exit(2);
});

process.on('uncaughtException', function (err) {
  logger.global().error(err.stack ? err.stack : 'Uncaught Exception : ' + err.message);
  process.exit(3);
});
