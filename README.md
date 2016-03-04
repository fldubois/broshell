# broshell

> Remote shell inside a web browser

## Warning

This version is a pre-release, no security is currently implemented (authentification or connection encryption).
Therefore you should not expose broshell access on public networks.

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
| `-p`  | `--path`    | `current directory`   | Startup working directory            |
