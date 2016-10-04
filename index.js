'use strict';

process.name = 'broshell';

var crypto = require('crypto');
var http   = require('http');
var path   = require('path');
var spawn  = require('child_process').spawn;

var express = require('express');
var mkdirp  = require('mkdirp');
var winston = require('winston');

var config = require('./lib/config.js');

try {
  mkdirp.sync(config.get('logs'));
} catch (err) {
  if (err.code !== 'EEXIST') {
    throw err;
  }
}

var transports = [
  new winston.transports.Console({
    level: config.get('verbose') ? 'verbose' : 'info',
    colorize: true,
    timestamp: true,
    formatter: function(options) {
      var timestampFn = function () {
        return new Date().toISOString();
      }

      if (typeof options.timestamp === 'function') {
        timestampFn = options.timestamp;
      }

      var timestamp = options.timestamp ? timestampFn() + ' - ' : '';
      var level     = (options.colorize ? winston.config.colorize(options.level) : options.level) + ' ';
      var session   = '';
      var message   = options.message;
      var meta      = '';

      if (options.meta.session) {
        session = '{' + options.meta.session + '} ';
        delete options.meta.session;
      }

      if (Object.keys(options.meta).length > 0) {
        meta = '\n\t' + JSON.stringify(options.meta);
      }

      return timestamp + level + session + message + meta;
    }
  }),
  new winston.transports.File({
    name: 'global',
    filename: path.join(config.get('logs'), 'broshell.log'),
    level: 'verbose',
    timestamp: true
  })
];

var logger = new winston.Logger({transports: transports});

var app = express();

app.use(express.static('public'));

var server = app.listen(config.get('port'), function () {
  logger.info('Broshell listening on port ' + config.get('port'));
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

  var sessionLogger = new winston.Logger({
    transports: transports.concat([
      new winston.transports.File({
        name: 'session',
        filename: path.join(config.get('logs'), 'broshell-' + new Date().toISOString() + '-' + session + '.log'),
        level: 'verbose',
        timestamp: true
      })
    ])
  });

  sessionLogger.info('Connection from ' + socket.request.connection.remoteAddress, {session: session});

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
          sessionLogger.verbose('[context]', JSON.stringify(context), {session: session});
          socket.emit('context', context);
        }
      } else {
        sessionLogger.info('[stdout]', line, {session: session});

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
      sessionLogger.info('[stderr]', line, {session: session});
      socket.emit('stderr', line);
    });
  });

  bash.stdin.on('error', function (err) {
    if (err.code !== 'ECONNRESET') {
      throw err;
    }
  });

  bash.on('close', function (code) {
    sessionLogger.info('[close]', code, {session: session});
    socket.emit('close', code);
  });

  socket.on('cmd', function (cmd) {
    sessionLogger.info('[cmd]', cmd.replace(/(\n)*$/, ''), {session: session});
    bash.stdin.write(cmd.replace(/(\n)*$/, '\n') + resetHistoryIndex + boundary);
  });

  socket.on('interrupt', function () {
    sessionLogger.info('[interrupt]', {session: session});
    spawn('pkill', ['-P', bash.pid]);
  });

  socket.on('history', function (direction, callback) {
    sessionLogger.verbose('[history]', direction, {session: session});
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
    sessionLogger.info('Disconnection from ' + socket.request.connection.remoteAddress, {session: session});

    if (bash.connected) {
      bash.stdin.write(' history -a\n');
    }
  });

  bash.stdin.write(boundary);
});

process.on('exit', function (code) {
  logger.info('Exiting with code : ' + code);
});

process.on('SIGINT', function (err) {
  logger.info('SIGINT signal received');
  process.exit(2);
});

process.on('uncaughtException', function (err) {
  logger.error(err.stack ? err.stack : 'Uncaught Exception : ' + err.message);
  process.exit(3);
});
