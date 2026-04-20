# Cross-Platform QA Testing with VMs

## Problem

pi-dashboard has platform-specific behavior (node-pty compilation, PTY spawning, path handling, native dependencies) that can only be validated on real operating systems. Currently there is no systematic way to verify clean-state installation and runtime behavior across macOS, Linux, and Windows. Platform-specific bugs surface only when real users hit them.

## Solution

Build a Packer-based VM test infrastructure using VMware Fusion. Base images are built from ISOs with OS + prerequisites pre-installed (Node.js, Git, build tools). Test runs clone a base image, install pi-dashboard from npm, execute a test suite via SSH, report results, and discard the clone. The same base images support manual GUI access for interactive debugging.

## Platform Matrix

| Image | Arch | Host Machine | Base OS |
|-------|------|-------------|---------|
| Ubuntu 24.04 | x86_64 | Intel Mac | Ubuntu Server |
| Ubuntu 24.04 | aarch64 | M1 Mac | Ubuntu Server |
| Windows 11 | x86_64 | Intel Mac | Windows 11 |
| macOS 14 (Sonoma) | x86_64 | Intel Mac | macOS Sonoma |
| macOS 14 (Sonoma) | aarch64 | M1 Mac | macOS Sonoma |

## Architecture

```
Packer (image definitions)
├── vmware-iso builder (all platforms)
├── Provisioners: shell scripts per OS
└── Variable files per OS version

VMware Fusion (runtime)
├── Intel Mac: Ubuntu x86, Windows, macOS x86
└── M1 Mac: Ubuntu ARM, macOS ARM
```

### Image Build Flow

```
ISO → Packer boots VM → Auto-install OS → Provision prereqs → Base image (.vmdk)
```

### Test Flow

```
Clone base image → Boot → SSH in → npm install pi-dashboard → Run tests → Report → Discard clone
```

### Manual Flow

```
Clone base image → Boot with GUI → Interactive use → Discard when done
```

## Base Image Contents

Each base image includes:
- Clean OS install with SSH/remote access enabled
- Node.js (LTS via nvm/fnm on Unix, installer on Windows)
- Git
- Build tools (build-essential / Xcode CLI Tools / VS Build Tools)
- A test user account with SSH key access

The images do NOT include pi-dashboard — that's installed fresh each test run.

## Test Suite Scope

1. **Install test** — `npm install -g @blackbelt-technology/pi-dashboard` succeeds, node-pty compiles
2. **Server start** — `pi-dashboard start` runs, health endpoint responds
3. **WebSocket** — Client can connect to both pi and browser WS gateways
4. **Terminal** — PTY spawning works (platform-specific: ConPTY on Windows, pty on Unix)
5. **Git operations** — Branch listing, checkout work from within the server
6. **Electron** — App launches (if packaged for that platform)

## Directory Structure

```
qa/
├── packer/
│   ├── ubuntu-x86.pkr.hcl
│   ├── ubuntu-arm.pkr.hcl
│   ├── windows.pkr.hcl
│   ├── macos-x86.pkr.hcl
│   ├── macos-arm.pkr.hcl
│   ├── scripts/
│   │   ├── provision-common.sh      # shared: nvm, node LTS
│   │   ├── provision-linux.sh       # apt, build-essential
│   │   ├── provision-macos.sh       # xcode CLI tools, brew
│   │   └── provision-windows.ps1    # choco/winget, VS build tools
│   ├── http/
│   │   ├── user-data                # Ubuntu cloud-init / autoinstall
│   │   └── autounattend.xml         # Windows unattended install
│   └── vars/
│       ├── ubuntu-24.pkrvars.hcl
│       ├── win-11.pkrvars.hcl
│       └── macos-14.pkrvars.hcl
├── tests/
│   ├── 01-install.sh
│   ├── 02-server-start.sh
│   ├── 03-websocket.sh
│   ├── 04-terminal.sh
│   ├── 05-git-ops.sh
│   ├── 06-electron.sh
│   └── run-all.sh
├── Makefile
└── README.md
```

## Scope

- Local only (no CI integration in this change)
- VMware Fusion on both machines (free personal license)
- Packer for image building (rebuildable for OS updates)
- SSH-based test execution
- Manual GUI access from same base images

## Out of Scope

- CI/CD pipeline integration (future change)
- Image sharing/syncing between machines (manual for now)
- Performance/load testing
- Docker-based testing (separate `docker-packaging` change exists)

## Implementation Order

1. Linux x86 (Ubuntu) — simplest Packer automation, nail the workflow
2. Linux ARM (Ubuntu) — same scripts, different ISO/arch
3. Windows x86 — autounattend.xml, PowerShell provisioning
4. macOS x86 — trickiest Packer automation (no preseed equivalent)
5. macOS ARM — same approach as x86, different host

## Risks

- **macOS Packer automation**: macOS has no preseed/kickstart equivalent. May need manual initial install then snapshot, or use IPSW-based approach for ARM. Spike recommended.
- **Base image size**: VMware images are 20-60GB each. Need sufficient disk space on both machines.
- **Windows activation**: Test VMs need either evaluation licenses or KMS. Windows 11 evaluation ISOs are available from Microsoft.
