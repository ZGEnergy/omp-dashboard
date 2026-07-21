import { randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SKILL_FILENAME = "SKILL.md";

function fail(message) {
  throw new Error(message);
}

function assertDestinationPath(destination) {
  if (typeof destination !== "string" || destination.length === 0) {
    fail("destination must be a non-empty path");
  }
  if (!path.isAbsolute(destination)) {
    fail("destination must be absolute");
  }
  if (destination.split(path.sep).includes("..")) {
    fail("destination parent traversal is not allowed");
  }
}

function assertNoSymlinkComponents(destination) {
  const absolute = path.resolve(destination);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  const components = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);

  for (const component of components) {
    current = path.join(current, component);
    if (!existsSync(current)) {
      continue;
    }
    const stat = lstatSync(current);
    if (stat.isSymbolicLink()) {
      fail(`destination symlink is not allowed: ${current}`);
    }
    if (!stat.isDirectory()) {
      fail(`destination component is not a directory: ${current}`);
    }
  }
}

function assertSafeDestination(destination, { create }) {
  assertDestinationPath(destination);
  assertNoSymlinkComponents(destination);

  if (create && !existsSync(destination)) {
    mkdirSync(destination, { recursive: true, mode: 0o755 });
    assertNoSymlinkComponents(destination);
  }

  if (!existsSync(destination)) {
    return;
  }
  const stat = lstatSync(destination);
  if (stat.isSymbolicLink()) {
    fail(`destination symlink is not allowed: ${destination}`);
  }
  if (!stat.isDirectory()) {
    fail(`destination must be a directory: ${destination}`);
  }
}

function assertSafeTarget(destination) {
  const target = path.join(destination, SKILL_FILENAME);
  if (!existsSync(target)) {
    return target;
  }
  const stat = lstatSync(target);
  if (stat.isSymbolicLink()) {
    fail(`destination skill symlink is not allowed: ${target}`);
  }
  if (!stat.isFile()) {
    fail(`destination skill must be a regular file: ${target}`);
  }
  return target;
}

function readCanonicalSource(source) {
  if (typeof source !== "string" || source.length === 0 || !path.isAbsolute(source)) {
    fail("source must be an absolute path");
  }
  const sourceStat = lstatSync(source);
  if (sourceStat.isSymbolicLink()) {
    fail("canonical source symlink is not allowed");
  }
  if (!sourceStat.isFile()) {
    fail("source must be a regular file");
  }
  return readFileSync(source);
}

function report({ mode, source, destination, sourceBytes, destinationBytes, installed }) {
  const identical = destinationBytes !== null && sourceBytes.equals(destinationBytes);
  return {
    mode,
    source,
    destination,
    bytes: sourceBytes.byteLength,
    identical,
    drift: !identical,
    installed,
  };
}

/**
 * Compare or atomically install the canonical SKILL.md into a managed directory.
 * The helper never copies any artifact besides SKILL.md.
 */
export function installManagedSkill({ source, destination, mode }) {
  if (mode !== "check" && mode !== "install") {
    fail("mode must be check or install");
  }

  const sourceBytes = readCanonicalSource(source);
  assertSafeDestination(destination, { create: mode === "install" });

  if (!existsSync(destination)) {
    return report({
      mode,
      source,
      destination,
      sourceBytes,
      destinationBytes: null,
      installed: false,
    });
  }

  const target = assertSafeTarget(destination);
  const destinationBytes = existsSync(target) ? readFileSync(target) : null;
  if (mode === "check") {
    return report({
      mode,
      source,
      destination,
      sourceBytes,
      destinationBytes,
      installed: false,
    });
  }

  if (destinationBytes !== null && sourceBytes.equals(destinationBytes)) {
    return report({
      mode,
      source,
      destination,
      sourceBytes,
      destinationBytes,
      installed: false,
    });
  }

  const temporary = path.join(
    destination,
    `.${SKILL_FILENAME}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`,
  );
  let renamed = false;
  try {
    writeFileSync(temporary, sourceBytes, { flag: "wx", mode: 0o600 });
    const temporaryBytes = readFileSync(temporary);
    if (!sourceBytes.equals(temporaryBytes)) {
      fail("temporary managed skill verification failed");
    }
    renameSync(temporary, target);
    renamed = true;
    const installedBytes = readFileSync(target);
    if (!sourceBytes.equals(installedBytes)) {
      fail("post-install managed skill verification failed");
    }
    return report({
      mode,
      source,
      destination,
      sourceBytes,
      destinationBytes: installedBytes,
      installed: true,
    });
  } finally {
    if (!renamed && existsSync(temporary)) {
      unlinkSync(temporary);
    }
  }
}

function parseCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--source" || argument === "--destination" || argument === "--mode") {
      const value = argv[index + 1];
      if (!value || options[argument.slice(2)] !== undefined) {
        fail(`invalid ${argument} arguments`);
      }
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    fail(`unknown argument: ${argument}`);
  }
  if (!options.source || !options.destination || !options.mode) {
    fail("usage: install-managed-skill.mjs --source PATH --destination PATH --mode check|install");
  }
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = installManagedSkill(parseCli(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}${os.EOL}`);
    process.exitCode = result.drift ? 1 : 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}${os.EOL}`);
    process.exitCode = 1;
  }
}
