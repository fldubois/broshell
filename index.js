'use strict';

process.name = 'broshell';

var express = require('express');

var app = express();

var server = app.listen(8080, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('BroShell listening at http://%s:%s', host, port);
});

var shasum = crypto.createHash('sha1');
shasum.update('boundary-' + Math.random());
var token = shasum.digest('hex');

var boundary = ' echo "' + token + JSON.stringify({
  username: "`whoami`",
  hostname: "`hostname`",
  cwd: "`pwd`"
}).replace(/"/g, '\\"') + '"\n';

var resetHistoryIndex = ' HISTINDEX=0;'

var verbose = true;

// Socket.io server

var io = require('socket.io')(server);

io.on('connection', function (socket) {
  console.log('connection');

  var bash = spawn('/bin/bash', [], {
    cwd: process.cwd(),
    env: {
      HISTFILE: '/tmp/hst',
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
        var context = JSON.parse(line.replace(token, ''));
        console.log('[context]', JSON.stringify(context));
        socket.emit('context', context);

        if (typeof cb === 'function') {
          cb(context);
          cb = null;
        }

        verbose = true;
      } else if (verbose) {
        console.log('[stdout]', line);
        socket.emit('stdout', line);
      }
    });
  });

  bash.stderr.on('data', function (data) {
    data.toString().replace(/(\n)*$/, '').split('\n').forEach(function (line) {
      console.log('[stderr]', line);
      socket.emit('stderr', line);
    });
  });

  bash.on('close', function (code) {
    console.log('[close]', code);
    socket.emit('close', code);
  });

  socket.on('cmd', function (cmd, callback) {
    cb = callback;
    console.log('[cmd]', cmd.replace(/(\n)*$/, ''));
    bash.stdin.write(cmd.replace(/(\n)*$/, '\n') + boundary);
    // Execute the command
  });

  socket.on('history', function (direction, callback) {
    console.log('[history]', direction);
    cb = callback;
    verbose = false;

    if (direction < 0) {
      var histsize = '$(history | tail -n 1 | awk -F "[[:space:]]+" \'{print $2}\')';
      var cmd = 'HISTINDEX=$((HISTINDEX-1>-' + histsize + '?$HISTINDEX-1:-' + histsize +'));'
    } else {
      var cmd = 'HISTINDEX=$((HISTINDEX+1<-1?$HISTINDEX+1:-1));'
    }

    bash.stdin.write(' ' + cmd + 'fc -l $HISTINDEX $HISTINDEX | sed -e "s/^[0-9]\\+\\t\\?\\s\\?//"\n' + boundary);
  });
});
