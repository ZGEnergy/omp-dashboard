# installed-package-enricher.ts — index

Enriches raw `packageManagerWrapper.listInstalled()` rows with version, description, displayName, isRecommended, isBundled. Exports `RawInstalledRow`, `readPackageJsonMeta`, `extractBasenameFromSource`, `matchRecommendedEntry`, `computeIsBundled`, `enrichInstalledRow`, `enrichInstalledRows`. Reads on-disk `package.json`, matches `RECOMMENDED_EXTENSIONS`, checks bundled dir under Electron `resourcesPath`.
