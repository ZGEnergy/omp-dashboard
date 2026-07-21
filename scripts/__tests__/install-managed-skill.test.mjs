import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { installManagedSkill } from "../upstream-sync/install-managed-skill.mjs";

const shellInstaller = path.resolve("scripts/install-managed-skill.sh");

function makeFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "managed-skill-installer-"));
  const source = path.join(root, "canonical", "SKILL.md");
  const destination = path.join(root, "managed");
  mkdirSync(path.dirname(source), { recursive: true });
  writeFileSync(source, "canonical skill bytes\n", "utf8");
  return { root, source, destination };
}

describe("installManagedSkill", () => {
  let fixture;

  beforeEach(() => {
    fixture = makeFixture();
  });

  afterEach(() => {
    rmSync(fixture.root, { recursive: true, force: true });
  });

  it("reports drift in check mode without mutating the destination", () => {
    mkdirSync(fixture.destination, { recursive: true });
    const destinationFile = path.join(fixture.destination, "SKILL.md");
    writeFileSync(destinationFile, "stale managed bytes\n", "utf8");

    const result = installManagedSkill({
      source: fixture.source,
      destination: fixture.destination,
      mode: "check",
    });

    expect(result).toMatchObject({ mode: "check", drift: true, identical: false });
    expect(readFileSync(destinationFile, "utf8")).toBe("stale managed bytes\n");
  });

  it("synchronizes byte-identical content in install mode", () => {
    mkdirSync(fixture.destination, { recursive: true });
    writeFileSync(path.join(fixture.destination, "SKILL.md"), "stale managed bytes\n", "utf8");

    const result = installManagedSkill({
      source: fixture.source,
      destination: fixture.destination,
      mode: "install",
    });

    expect(result).toMatchObject({ mode: "install", drift: false, identical: true });
    expect(readFileSync(path.join(fixture.destination, "SKILL.md"))).toEqual(
      readFileSync(fixture.source),
    );
  });

  it("allows safe install and check through a symlinked ancestor", () => {
    const resolvedParent = path.join(fixture.root, "resolved-parent");
    const symlinkedParent = path.join(fixture.root, "symlinked-parent");
    mkdirSync(resolvedParent, { recursive: true });
    symlinkSync(resolvedParent, symlinkedParent, "dir");
    const destination = path.join(symlinkedParent, "managed");

    const installResult = installManagedSkill({
      source: fixture.source,
      destination,
      mode: "install",
    });
    const checkResult = installManagedSkill({
      source: fixture.source,
      destination,
      mode: "check",
    });

    expect(installResult).toMatchObject({ mode: "install", installed: true, identical: true });
    expect(checkResult).toMatchObject({ mode: "check", installed: false, drift: false, identical: true });
    expect(readFileSync(path.join(resolvedParent, "managed", "SKILL.md"), "utf8")).toBe(
      "canonical skill bytes\n",
    );
  });

  it("rejects destination paths containing parent traversal before mutation", () => {
    const outside = path.join(fixture.root, "outside");
    const traversingDestination = `${fixture.root}/managed/../outside`;

    expect(() =>
      installManagedSkill({
        source: fixture.source,
        destination: traversingDestination,
        mode: "install",
      }),
    ).toThrow(/traversal|destination/i);
    expect(() => readdirSync(outside)).toThrow();
  });

  it("rejects a destination directory symlink", () => {
    const outside = path.join(fixture.root, "outside");
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, fixture.destination, "dir");

    expect(() =>
      installManagedSkill({
        source: fixture.source,
        destination: fixture.destination,
        mode: "install",
      }),
    ).toThrow(/symlink|destination/i);
    expect(readdirSync(outside)).toEqual([]);
  });

  it("rejects a managed SKILL.md symlink instead of following it", () => {
    mkdirSync(fixture.destination, { recursive: true });
    const outsideFile = path.join(fixture.root, "outside-SKILL.md");
    writeFileSync(outsideFile, "must remain unchanged\n", "utf8");
    symlinkSync(outsideFile, path.join(fixture.destination, "SKILL.md"));

    expect(() =>
      installManagedSkill({
        source: fixture.source,
        destination: fixture.destination,
        mode: "install",
      }),
    ).toThrow(/symlink|destination/i);
    expect(readFileSync(outsideFile, "utf8")).toBe("must remain unchanged\n");
  });

  it("replaces the destination atomically and leaves no temporary artifact", () => {
    mkdirSync(fixture.destination, { recursive: true });
    writeFileSync(path.join(fixture.destination, "SKILL.md"), "old bytes\n", "utf8");

    installManagedSkill({
      source: fixture.source,
      destination: fixture.destination,
      mode: "install",
    });

    expect(readFileSync(path.join(fixture.destination, "SKILL.md"), "utf8")).toBe(
      "canonical skill bytes\n",
    );
    expect(readdirSync(fixture.destination)).toEqual(["SKILL.md"]);
  });
});

describe("install-managed-skill.sh", () => {
  it("accepts only the documented mode argument without invoking installation", () => {
    const result = spawnSync("bash", [shellInstaller, "--install", "--unexpected"], {
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toMatch(/--check|--install|usage/i);
  });
});
