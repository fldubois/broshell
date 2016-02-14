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

var boundary = ' echo "' + token + '"\n';

// Socket.io server

var io = require('socket.io')(server);

io.on('connection', function (socket) {
  console.log('connection');

  var bash = spawn('/bin/bash', [], {
    cwd: process.cwd()
  });
  var cb;

  bash.stdout.on('data', function (data) {
    data.toString().replace(/(\n)*$/, '').split('\n').forEach(function (line) {
      if (line.indexOf(token) === 0) {
        if (typeof cb === 'function') {
          cb();
          cb = null;
        }
      } else {
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
});
