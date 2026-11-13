# JERRY DATA CENTER OTA

Initial release: v1.4.1

Upload this directory structure to the repository root:
- `JERRY_OTA.js`: install once in Scriptable; checks GitHub and runs the latest source.
- `latest.js`: current app source.
- `version.json`: release manifest.
- `releases/v1.4.1.js`: archived baseline.

## Install
1. Upload all files and the `releases` folder to the repository root.
2. In Scriptable create a script named **JERRY DATA CENTER**.
3. Paste `JERRY_OTA.js` into it and save.
4. Run once online, then select this script for the Scriptable widget.

The launcher caches the last successful source locally for offline fallback.
API keys, coordinates, preferences, and cache stay in Scriptable local storage; do not upload them.
