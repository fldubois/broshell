'use strict';

var path = require('path');

var winston = require('winston');

var config = require('./config.js');

winston.loggers.options.transports = [
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

winston.loggers.add('global');

module.exports = {
  global: function () {
    return winston.loggers.get('global');
  },
  session: function (id) {
    return winston.loggers.get(id, {
      file: {
        name: id,
        filename: path.join(config.get('logs'), 'broshell-' + id + '.log'),
        level: 'verbose',
        timestamp: true
      }
    });
  }
}
