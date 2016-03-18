# broshell

> Remote shell inside a web browser

## Warning

This version is a pre-release, no security is currently implemented (authentification or connection encryption).
Therefore you should not expose broshell access on public networks.

## Native shell vs child processes

The goal of this project is to reproduct the full experience of a native shell over the internet.

At first glance, the most logical way to achive with node.js this is to spawn a process for each command.
But this approach lack some useful features of a shell (i.e. environment variables, history, ...).
Of course, these features could be rewrite in JavaScript, but it seems a bit like reinventing the wheel.

Therefore, broshell is based on another solution: spawn a native shell and transfer interactions between the web client and the native shell.

## Install

1. Clone this repository

  `git@github.com:fldubois/broshell.git`

2. Install the npm dependencies

  `npm install`

## Usage

1. Start the server with node

  `node index.js [arguments]`

2. Open a web browser and navigate to the broshell URL

  `http://[broshell server IP]:[broshell port]`

### Command line arguments

| Short | Long        | Default               | Description                          |
| ----- | ----------- | --------------------- | ------------------------------------ |
| `-p`  | `--port`    | `8080`                | Listening port for client connection |
| `-x`  | `--bin`     | `/bin/bash`           | Path to native shell binaries        |
| `-H`  | `--history` | `~/.broshell_history` | Path to history save file            |
| `-u`  | `--uid`     | `node process uid`    | User identity of the bash process    |
| `-g`  | `--gid`     | `node process gid`    | Group identity of the bash process   |
| `-P`  | `--path`    | `current directory`   | Startup working directory            |
| `-l`  | `--logs`    | `/var/log/broshell`   | Logs directory                       |
| `-v`  | `--verbose` |                       | Enable verbose logging               |

## TODO

* Log message on Broshell close
* Split front (html, css, js)
* Split back (modules bash, configuration)
* User management
* Tab support (front)
* Theme support (front)
* Bash alternatives (zsh, powsershell, ...)
* Autocompletion

## License

See [License](LICENSE)
