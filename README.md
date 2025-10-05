xscli
=================

XanoScript CLI for Xano's Metadata API


[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/xscli.svg)](https://npmjs.org/package/xscli)
[![Downloads/week](https://img.shields.io/npm/dw/xscli.svg)](https://npmjs.org/package/xscli)


<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g xscli
$ xscli COMMAND
running command...
$ xscli (--version)
xscli/0.0.1 darwin-arm64 node-v22.19.0
$ xscli --help [COMMAND]
USAGE
  $ xscli COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`xscli create_api`](#xscli-create_api)
* [`xscli foo bar [FILE]`](#xscli-foo-bar-file)
* [`xscli hello PERSON`](#xscli-hello-person)
* [`xscli hello world`](#xscli-hello-world)
* [`xscli help [COMMAND]`](#xscli-help-command)
* [`xscli plugins`](#xscli-plugins)
* [`xscli plugins add PLUGIN`](#xscli-plugins-add-plugin)
* [`xscli plugins:inspect PLUGIN...`](#xscli-pluginsinspect-plugin)
* [`xscli plugins install PLUGIN`](#xscli-plugins-install-plugin)
* [`xscli plugins link PATH`](#xscli-plugins-link-path)
* [`xscli plugins remove [PLUGIN]`](#xscli-plugins-remove-plugin)
* [`xscli plugins reset`](#xscli-plugins-reset)
* [`xscli plugins uninstall [PLUGIN]`](#xscli-plugins-uninstall-plugin)
* [`xscli plugins unlink [PLUGIN]`](#xscli-plugins-unlink-plugin)
* [`xscli plugins update`](#xscli-plugins-update)

## `xscli create_api`

Create API with the provided key

```
USAGE
  $ xscli create_api -k <value>

FLAGS
  -k, --api_key=<value>  [env: XANO_API_KEY]  (required) API key for the service

DESCRIPTION
  Create API with the provided key

EXAMPLES
  hello this is an example
```

_See code: [src/commands/create_api/index.ts](https://github.com/git/xscli/blob/v0.0.1/src/commands/create_api/index.ts)_

## `xscli foo bar [FILE]`

describe the command here

```
USAGE
  $ xscli foo bar [FILE] [-f] [-n <value>]

ARGUMENTS
  FILE  file to read

FLAGS
  -f, --force
  -n, --name=<value>  name to print

DESCRIPTION
  describe the command here

EXAMPLES
  $ xscli foo bar
```

_See code: [src/commands/foo/bar.ts](https://github.com/git/xscli/blob/v0.0.1/src/commands/foo/bar.ts)_

## `xscli hello PERSON`

Say hello

```
USAGE
  $ xscli hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ xscli hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [src/commands/hello/index.ts](https://github.com/git/xscli/blob/v0.0.1/src/commands/hello/index.ts)_

## `xscli hello world`

Say hello world

```
USAGE
  $ xscli hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ xscli hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [src/commands/hello/world.ts](https://github.com/git/xscli/blob/v0.0.1/src/commands/hello/world.ts)_

## `xscli help [COMMAND]`

Display help for xscli.

```
USAGE
  $ xscli help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for xscli.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.33/src/commands/help.ts)_

## `xscli plugins`

List installed plugins.

```
USAGE
  $ xscli plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ xscli plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.49/src/commands/plugins/index.ts)_

## `xscli plugins add PLUGIN`

Installs a plugin into xscli.

```
USAGE
  $ xscli plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into xscli.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the XSCLI_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the XSCLI_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ xscli plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ xscli plugins add myplugin

  Install a plugin from a github url.

    $ xscli plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ xscli plugins add someuser/someplugin
```

## `xscli plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ xscli plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ xscli plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.49/src/commands/plugins/inspect.ts)_

## `xscli plugins install PLUGIN`

Installs a plugin into xscli.

```
USAGE
  $ xscli plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into xscli.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the XSCLI_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the XSCLI_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ xscli plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ xscli plugins install myplugin

  Install a plugin from a github url.

    $ xscli plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ xscli plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.49/src/commands/plugins/install.ts)_

## `xscli plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ xscli plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.

  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ xscli plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.49/src/commands/plugins/link.ts)_

## `xscli plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ xscli plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ xscli plugins unlink
  $ xscli plugins remove

EXAMPLES
  $ xscli plugins remove myplugin
```

## `xscli plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ xscli plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.49/src/commands/plugins/reset.ts)_

## `xscli plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ xscli plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ xscli plugins unlink
  $ xscli plugins remove

EXAMPLES
  $ xscli plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.49/src/commands/plugins/uninstall.ts)_

## `xscli plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ xscli plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ xscli plugins unlink
  $ xscli plugins remove

EXAMPLES
  $ xscli plugins unlink myplugin
```

## `xscli plugins update`

Update installed plugins.

```
USAGE
  $ xscli plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.49/src/commands/plugins/update.ts)_
<!-- commandsstop -->
