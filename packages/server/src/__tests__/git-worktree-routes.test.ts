/**
 * HTTP-level route tests for the worktree endpoints registered by
 * `registerGitRoutes`. Exercises envelope shape, status codes, and the
 * stable `code` field for each documented error arm.
 *
 * See change: add-worktree-spawn-dialog.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Fastify, { type FastifyInstance } from "fastify";
import { registerGitRoutes } from "../routes/git-routes.js";

function git(cmd: string, cwd: string) {
  execSync(`git ${cmd}`, { cwd, stdio: ["pipe", "pipe", "pipe"] });
}

function makeRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "git-wt-routes-")));
  git("-c init.defaultBranch=main init", dir);
  git("config user.email test@test.com", dir);
  git("config user.name Test", dir);
  writeFileSync(join(dir, "README.md"), "init");
  git("add .", dir);
  git("commit -m init", dir);
  return dir;
}

async function makeApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // No-op network guard so we can hit the endpoints in tests.
  registerGitRoutes(app, { networkGuard: async () => {} });
  await app.ready();
  return app;
}

describe("GET /api/git/head", () => {
  let app: FastifyInstance;
  let repo: string;
  beforeEach(async () => {
    app = await makeApp();
    repo = makeRepo();
  });
  afterEach(async () => {
    rmSync(repo, { recursive: true, force: true });
    await app.close();
  });

  it("returns { branch, detached, sha } for a fresh repo", async () => {
    const res = await app.inject({ method: "GET", url: `/api/git/head?cwd=${encodeURIComponent(repo)}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.branch).toBe("main");
    expect(body.data.detached).toBe(false);
    expect(body.data.sha).toMatch(/^[0-9a-f]{4,}$/);
  });

  it("returns code:cwd_invalid + 400 when cwd is missing", async () => {
    const res = await app.inject({ method: "GET", url: `/api/git/head` });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: "cwd_invalid" });
  });

  it("returns code:not_a_repo for a non-git directory", async () => {
    const plain = mkdtempSync(join(tmpdir(), "no-git-route-"));
    try {
      const res = await app.inject({ method: "GET", url: `/api/git/head?cwd=${encodeURIComponent(plain)}` });
      expect(res.statusCode).toBe(200); // not_a_repo is a success-shape envelope (matches existing /branches arm)
      expect(res.json()).toMatchObject({ success: false, code: "not_a_repo" });
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});

describe("GET /api/git/worktrees", () => {
  let app: FastifyInstance;
  let repo: string;
  beforeEach(async () => {
    app = await makeApp();
    repo = makeRepo();
  });
  afterEach(async () => {
    rmSync(repo, { recursive: true, force: true });
    await app.close();
  });

  it("returns one entry (main) for a fresh repo", async () => {
    const res = await app.inject({ method: "GET", url: `/api/git/worktrees?cwd=${encodeURIComponent(repo)}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.worktrees).toHaveLength(1);
    expect(body.data.worktrees[0]).toMatchObject({ isMain: true, branch: "main" });
  });

  it("returns code:not_a_repo for a non-git directory", async () => {
    const plain = mkdtempSync(join(tmpdir(), "no-git-route-"));
    try {
      const res = await app.inject({ method: "GET", url: `/api/git/worktrees?cwd=${encodeURIComponent(plain)}` });
      expect(res.json()).toMatchObject({ success: false, code: "not_a_repo" });
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});

describe("POST /api/git/worktree", () => {
  let app: FastifyInstance;
  let repo: string;
  beforeEach(async () => {
    app = await makeApp();
    repo = makeRepo();
  });
  afterEach(async () => {
    rmSync(repo, { recursive: true, force: true });
    await app.close();
  });

  it("creates a worktree with auto-derived path and returns 200", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/git/worktree`,
      payload: { cwd: repo, base: "main", newBranch: "feat/dark-mode" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.path).toBe(join(repo, ".worktrees", "feat-dark-mode"));
    expect(body.data.branch).toBe("feat/dark-mode");
    expect(body.data.excludeAppended).toBe(true);
  });

  it("returns 400 + code:cwd_invalid when base is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/git/worktree`,
      payload: { cwd: repo, newBranch: "feat/x" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: "cwd_invalid" });
  });

  it("returns 400 + code:cwd_invalid when newBranch is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/git/worktree`,
      payload: { cwd: repo, base: "main" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: "cwd_invalid" });
  });

  it("returns 400 + code:base_not_found when base ref does not exist", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/git/worktree`,
      payload: { cwd: repo, base: "no-such-ref", newBranch: "feat/x" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: "base_not_found" });
  });

  it("returns 409 + code:path_exists when target path is non-empty", async () => {
    const collide = join(repo, ".worktrees", "feat-x");
    execSync(`mkdir -p '${collide}' && echo hi > '${collide}/file.txt'`);
    try {
      const res = await app.inject({
        method: "POST",
        url: `/api/git/worktree`,
        payload: { cwd: repo, base: "main", newBranch: "feat/x" },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ success: false, code: "path_exists" });
    } finally {
      rmSync(join(repo, ".worktrees"), { recursive: true, force: true });
    }
  });
});
