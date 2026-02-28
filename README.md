# default-plugin

Built-in core plugin for Zentra.

This is the preinstalled `core` plugin that provides the standard channel types
(text, announcement, gallery, forum, voice) and default header actions (pinned
messages, member list). It registers everything through the same SDK that
third-party plugins use - the only difference is it's compiled into the main
frontend bundle instead of loaded as a separate JS file at runtime.

The plugin source does not import frontend internal modules directly. It only
uses `@zentra/plugin-sdk` and receives runtime functionality from Zentra.

## Files

- `src/manifest.json` - canonical core plugin metadata
- `src/index.ts` - register function called by the plugin runtime
- `src/views/*.svelte` - channel view components
- `package.json` - package identity so it can be consumed as a normal plugin package

## How it works

The frontend's plugin runtime imports `register()` from this package via
the `@zentra/default-plugin` Vite alias and calls it with the SDK object.
The plugin then registers its channel types and header actions exactly like
any other plugin would. The backend seeds it as a `builtIn` plugin so it's
auto-installed on every community.
