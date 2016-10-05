'use strict';

var events = require('events');
var crypto = require('crypto');
var spawn  = require('child_process').spawn;
var util   = require("util");

var config = require('./config.js');

var resetHistoryIndex = ' HISTINDEX=0;';

function Bash() {
  events.EventEmitter.call(this);

  var self = this;

  self.token = crypto.createHash('sha1').update('boundary-' + Math.random()).digest('hex');

  self.boundary = ' echo "' + self.token + JSON.stringify({
    username: "`whoami`",
    hostname: "`hostname`",
    cwd: "`pwd`"
  }).replace(/"/g, '\\"') + '"\n';

  self.bash = spawn(config.get('bin'), [], {
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

  self.cb = null;

  self.bash.stdout.on('data', function (data) {
    data.toString().replace(/(\n)*$/, '').split('\n').forEach(function (line) {
      if (line.indexOf(self.token) === 0) {
        if (typeof self.cb === 'function') {
          self.cb = null;
        } else {
          self.emit('context', JSON.parse(line.replace(self.token, '')));
        }
      } else {
        if (typeof self.cb === 'function') {
          self.cb(line);
        } else {
          self.emit('stdout', line);
        }
      }
    });
  });

  self.bash.stderr.on('data', function (data) {
    data.toString().replace(/(\n)*$/, '').split('\n').forEach(function (line) {
      self.emit('stderr', line);
    });
  });

  self.bash.stdin.on('error', function (err) {
    if (err.code !== 'ECONNRESET') {
      throw err;
    }
  });

  self.bash.on('close', function (code) {
    self.emit('close', code);
  });

  self.bash.stdin.write(self.boundary);
}

util.inherits(Bash, events.EventEmitter);

Bash.prototype.execute = function(cmd) {
  this.bash.stdin.write(cmd.replace(/(\n)*$/, '\n') + resetHistoryIndex + this.boundary);
};

Bash.prototype.interrupt = function() {
  spawn('pkill', ['-P', this.bash.pid]);
};

Bash.prototype.history = function(direction, callback) {
  this.cb = callback;

  if (direction < 0) {
    var histsize = '$(history | tail -n 1 | awk -F "[[:space:]]+" \'{print $2}\')';
    var cmd = 'HISTINDEX=$((HISTINDEX-1>-' + histsize + '?$HISTINDEX-1:-' + histsize +'));'
  } else {
    var cmd = 'HISTINDEX=$((HISTINDEX+1<-1?$HISTINDEX+1:-1));'
  }

  this.bash.stdin.write(' ' + cmd + 'fc -l $HISTINDEX $HISTINDEX | sed -e "s/^[0-9]\\+\\t\\?\\s\\?//"\n' + this.boundary);
};

Bash.prototype.close = function() {
  if (this.bash.connected) {
    this.bash.stdin.write(' history -a\n');
  }

  this.bash.kill();
};

module.exports = Bash;
