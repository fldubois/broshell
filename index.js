'use strict';

process.name = 'broshell';

var crypto = require('crypto');
var http   = require('http');
var spawn  = require('child_process').spawn;

var express = require('express');
var options = require('commander');

options.version(require('./package.json').version)
  .option('-p, --port [port]', 'Listening port for client connection [8080]', 8080)
  .option('-x, --bin [path]', 'Path to native shell binaries [/bin/bash]', '/bin/bash')
  .option('-H, --history [path]', 'Path to history save file [~/.broshell_history]', process.env.HOME + '/.broshell_history')
  .option('-u, --uid [uid]', 'User identity of the bash process [node process uid]', process.getuid())
  .option('-g, --gid [gid]', 'Group identity of the bash process [node process gid]', process.getgid())
  .option('-p, --path [path]', 'Startup working directory [current directory]', process.cwd())
  .parse(process.argv);

var app = express();

app.use(express.static('public'));

var server = app.listen(options.port, function () {
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

var resetHistoryIndex = ' HISTINDEX=0;';

// Socket.io server

var io = require('socket.io')(server);

io.on('connection', function (socket) {
  console.log('connection');

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
          console.log('[context]', JSON.stringify(context));
          socket.emit('context', context);
        }
      } else {
        console.log('[stdout]', line);

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
      console.log('[stderr]', line);
      socket.emit('stderr', line);
    });
  });

  bash.stdin.on('error', function (err) {
    if (err.code !== 'ECONNRESET') {
      throw err;
    }
  });

  bash.on('close', function (code) {
    console.log('[close]', code);
    socket.emit('close', code);
  });

  socket.on('cmd', function (cmd) {
    console.log('[cmd]', cmd.replace(/(\n)*$/, ''));
    bash.stdin.write(cmd.replace(/(\n)*$/, '\n') + resetHistoryIndex + boundary);
  });

  socket.on('interrupt', function () {
    console.log('[interrupt]');
    spawn('pkill', ['-P', bash.pid]);
  });

  socket.on('history', function (direction, callback) {
    console.log('[history]', direction);
    cb = callback;

    if (direction < 0) {
      var histsize = '$(history | tail -n 1 | awk -F "[[:space:]]+" \'{print $2}\')';
      var cmd = 'HISTINDEX=$((HISTINDEX-1>-' + histsize + '?$HISTINDEX-1:-' + histsize +'));'
    } else {
      var cmd = 'HISTINDEX=$((HISTINDEX+1<-1?$HISTINDEX+1:-1));'
    }

    bash.stdin.write(' ' + cmd + 'fc -l $HISTINDEX $HISTINDEX | sed -e "s/^[0-9]\\+\\t\\?\\s\\?//"\n' + boundary);
  });

  bash.stdin.write(boundary);
});
