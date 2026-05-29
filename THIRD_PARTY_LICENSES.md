# Third-party libraries used in Fresh Mind

Fresh Mind uses the following open-source libraries. Each library remains
under its own license; Fresh Mind's own source code remains under the
proprietary license described in [LICENSE](LICENSE).

## Runtime dependencies

| Library | License | Source |
|---|---|---|
| Electron | MIT | https://github.com/electron/electron |
| React | MIT | https://github.com/facebook/react |
| React DOM | MIT | https://github.com/facebook/react |
| Tiptap (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`) | MIT | https://github.com/ueberdosis/tiptap |
| Tiptap extensions (`highlight`, `image`, `placeholder`, `text-align`, `underline`) | MIT | https://github.com/ueberdosis/tiptap |
| better-sqlite3 | MIT | https://github.com/WiseLibs/better-sqlite3 |
| emoji-mart | MIT | https://github.com/missive/emoji-mart |
| `@emoji-mart/data`, `@emoji-mart/react` | MIT | https://github.com/missive/emoji-mart |
| auto-launch | MIT | https://github.com/Teamwork/node-auto-launch |
| node-cron | ISC | https://github.com/node-cron/node-cron |
| node-window-manager | MIT | https://github.com/sentialx/node-window-manager |

## Build / dev dependencies

| Library | License | Source |
|---|---|---|
| electron-vite | MIT | https://github.com/alex8088/electron-vite |
| electron-builder | MIT | https://github.com/electron-userland/electron-builder |
| electron-icon-builder | MIT | https://github.com/safu9/electron-icon-builder |
| `@electron/rebuild` | MIT | https://github.com/electron/rebuild |
| Vite | MIT | https://github.com/vitejs/vite |
| `@vitejs/plugin-react` | MIT | https://github.com/vitejs/vite-plugin-react |
| Sharp | Apache-2.0 | https://github.com/lovell/sharp |

## Notes

All listed libraries were installed via npm from the public npm registry and
are listed in `package.json`. Their full license texts are bundled with each
package inside `node_modules/<package>/LICENSE` and are also included in any
distributable build of Fresh Mind (via electron-builder's automatic
license aggregation).

If a license requires attribution at runtime and it is not currently
displayed in the application, please contact the author so it can be added.
