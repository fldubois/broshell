'use strict';

process.name = 'broshell';

var express = require('express');

var config = require('./lib/config.js');
var logger = require('./lib/logger.js');

var Bash = require('./lib/bash.js');

var app = express();

app.use(express.static('public'));

var server = app.listen(config.get('port'), function () {
  logger.global().info('Broshell listening on port ' + config.get('port'));
});

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

  var bash = new Bash();

  bash.on('context', function (context) {
    logger.session(session).verbose('[context]', JSON.stringify(context), {session: session});
    socket.emit('context', context);
  });

  bash.on('stdout', function (line) {
    logger.session(session).info('[stdout]', line, {session: session});
    socket.emit('stdout', line);
  });

  bash.on('stderr', function (line) {
    logger.session(session).info('[stderr]', line, {session: session});
    socket.emit('stderr', line);
  });

  bash.on('close', function (code) {
    logger.session(session).info('[close]', code, {session: session});
    socket.emit('close', code);
  });

  socket.on('cmd', function (cmd) {
    logger.session(session).info('[cmd]', cmd.replace(/(\n)*$/, ''), {session: session});
    bash.execute(cmd);
  });

  socket.on('interrupt', function () {
    logger.session(session).info('[interrupt]', {session: session});
    bash.interrupt();
  });

  socket.on('history', function (direction, callback) {
    logger.session(session).verbose('[history]', direction, {session: session});
    bash.history(direction, callback);
  });

  socket.on('disconnect', function () {
    logger.session(session).info('Disconnection from ' + socket.request.connection.remoteAddress, {session: session});
    bash.close();
  });
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
