'use strict';

function createPrompt(context) {
  var user = document.createElement('span');
  user.classList.add('user');
  user.innerHTML = context.username + '@' + context.hostname;

  var cwd = document.createElement('span');
  cwd.classList.add('cwd');
  cwd.innerHTML = context.cwd;

  var symbol = document.createElement('span');
  symbol.classList.add('symbol');
  symbol.innerHTML = context.username === 'root' ? '#' : '$';

  var prompt = document.createElement('span');
  prompt.classList.add('prompt');

  prompt.appendChild(user);
  prompt.appendChild(document.createTextNode('\u00A0'));
  prompt.appendChild(cwd);
  prompt.appendChild(document.createTextNode('\u00A0'));
  prompt.appendChild(symbol);
  prompt.appendChild(document.createTextNode('\u00A0'));

  return prompt;
}

var output = document.querySelector('#output');
var input  = document.querySelector('#input');

var cmd = {
  left:  document.querySelector('#cmd-left'),
  right: document.querySelector('#cmd-right')
};

var context = {};

console.log('Connecting to ', window.location.host);
var socket = io.connect(window.location.host);

socket.on('stdout', function (line) {
  var div = document.createElement('div');
  div.classList.add('line');
  div.innerHTML = line;

  output.appendChild(div);

  // Scroll to bottom
  window.scrollTo(0, document.body.scrollHeight);
});

socket.on('stderr', function (line) {
  var div = document.createElement('div');
  div.classList.add('line');
  div.classList.add('error');
  div.innerHTML = line;

  output.appendChild(div);

  // Scroll to bottom
  window.scrollTo(0, document.body.scrollHeight);
});

socket.on('context', function (ctx) {
  context = ctx;
  input.replaceChild(createPrompt(context), input.firstChild);
  input.classList.remove('hidden');

  // Scroll to bottom
  window.scrollTo(0, document.body.scrollHeight);
});

socket.on('close', function (code) {
  console.log('close', code);

  var div = document.createElement('div');
  div.classList.add('line');
  div.classList.add('error');
  div.innerHTML = 'Process exited with code ' + code;

  output.appendChild(div);

  // Scroll to bottom
  window.scrollTo(0, document.body.scrollHeight);
});

document.body.addEventListener('keypress', function (event) {
  if (event.keyCode >= 112 && event.keyCode <= 123) { // F1 to F12
    return;
  }

  if (!input.classList.contains('hidden')) {
    switch (event.keyCode) {
      case 13: // Enter
        var command = cmd.left.textContent + cmd.right.textContent;

        var div = document.createElement('div');
        div.classList.add('line');
        div.appendChild(createPrompt(context));
        div.appendChild(document.createTextNode(command));

        cmd.left.textContent = '';
        cmd.right.textContent = '';

        input.classList.add('hidden');

        output.appendChild(div);

        socket.emit('cmd', command);
        break;
      case 8: // Backspace
        if (cmd.left.textContent.length > 0) {
          cmd.left.textContent = cmd.left.textContent.substring(0, cmd.left.textContent.length - 1);
        }
        break;
      case 46: // Delete
        if (cmd.right.textContent.length > 0) {
          cmd.right.textContent = cmd.right.textContent.substring(1, cmd.right.textContent.length);
        }
        break;
      case 38: // Arrow Up
        socket.emit('history', -1, function (command) {
          cmd.left.textContent = command;
          cmd.right.textContent = '';
        });
        break;
      case 40: // Arrow Down
        socket.emit('history', 1, function (command) {
          cmd.left.textContent = command;
          cmd.right.textContent = '';
        });
        break;
      case 37: // Arrow Left
        if (cmd.left.textContent.length > 0) {
          cmd.right.textContent = cmd.left.textContent.charAt(cmd.left.textContent.length - 1) + cmd.right.textContent;
          cmd.left.textContent = cmd.left.textContent.substring(0, cmd.left.textContent.length - 1);
        }
        break;
      case 39: // Arrow Right
        if (cmd.right.textContent.length > 0) {
          cmd.left.textContent += cmd.right.textContent.charAt(0);
          cmd.right.textContent = cmd.right.textContent.substring(1);
        }
        break;
      default:
        if (event.charCode > 0) {
          cmd.left.textContent = cmd.left.textContent + event.key;
        }
    }

    // Scroll to bottom
    window.scrollTo(0, document.body.scrollHeight);
  } else {
    if (event.ctrlKey && (event.charCode === 67 || event.charCode === 99)) { // CTRL+C
      var div = document.createElement('div');
      div.classList.add('line');
      div.appendChild(document.createTextNode('^C'));

      output.appendChild(div);

      socket.emit('interrupt');
    }
  }

  event.preventDefault();
  event.stopPropagation();
}, false);
