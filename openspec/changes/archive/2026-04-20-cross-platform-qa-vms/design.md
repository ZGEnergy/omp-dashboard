## Context

pi-dashboard is a multi-component Node.js application with native dependencies (node-pty) that must work across macOS, Linux, and Windows. There is currently no way to verify clean-state installation or runtime behavior on these platforms. Two Mac machines are available: an Intel Mac desktop and an M1 MacBook, both running VMware Fusion (free personal license).

## Goals / Non-Goals

**Goals:**
- Reproducible, Packer-built VM base images for all 5 platform targets
- Automated test suite runnable via SSH against cloned VMs
- Manual GUI access to the same base images for interactive debugging
- Simple Makefile-driven workflow: `make build-<target>`, `make test-<target>`, `make manual-<target>`
- Rebuildable images (new OS version = update vars + rebuild)

**Non-Goals:**
- CI/CD integration (purely local for now)
- Image sharing or syncing between the two Macs
- Docker-based testing (covered by separate `docker-packaging` change)
- Performance or load testing
- Testing pi itself (only pi-dashboard install + runtime)

## Decisions

### D1: VMware Fusion as unified VM platform
**Choice**: VMware Fusion on both machines.
**Rationale**: Free for personal use, runs on both Intel and Apple Silicon Macs, supports macOS/Linux/Windows guests natively on Mac hardware. Packer has a mature `vmware-iso` builder.
**Alternatives considered**:
- Parallels: Better Windows ARM support but paid ($100/yr). Not needed since Windows runs on x86 Intel Mac.
- VirtualBox: No Apple Silicon support.
- UTM/QEMU: Works but less mature Packer integration, slower macOS guests.

### D2: Packer for image building
**Choice**: HashiCorp Packer with `vmware-iso` builder.
**Rationale**: Infrastructure-as-code for VM images. Declarative HCL files define the full build from ISO to provisioned snapshot. Rebuildable when OS versions change.
**Alternatives considered**:
- Manual snapshot: Works but not reproducible, no version control.
- Vagrant: Good for runtime but doesn't build images from ISOs.

### D3: Base images include prereqs (Option B)
**Choice**: Pre-install Node.js, Git, and build tools in the base image.
**Rationale**: Faster test runs — the focus is testing pi-dashboard installation, not OS package manager reliability. Prereqs change rarely compared to pi-dashboard itself.
**What's in each base image**:
- Ubuntu: `build-essential`, `curl`, nvm + Node LTS, Git
- Windows: Visual Studio Build Tools (C++ workload), Git for Windows, nvm-windows + Node LTS
- macOS: Xcode Command Line Tools, Homebrew, nvm + Node LTS, Git

### D4: Clone-test-discard workflow
**Choice**: Each test run clones the base image, runs tests, discards the clone.
**Rationale**: Guarantees clean state every run. VMware linked clones are fast (seconds) and space-efficient.

### D5: SSH-based test execution
**Choice**: All tests run over SSH, even on GUI-capable VMs.
**Rationale**: Scriptable, works identically across all platforms (OpenSSH on Windows too). Tests are shell scripts (bash on Unix, PowerShell on Windows).

### D6: OS auto-install methods
**Choice per platform**:
- Ubuntu: cloud-init autoinstall (subiquity)
- Windows: `autounattend.xml` with evaluation ISO
- macOS: Manual initial install, then snapshot. Packer drives post-install provisioning via SSH.

**Rationale**: Ubuntu and Windows have mature unattended install mechanisms. macOS lacks one — the pragmatic approach is a one-time manual install to get SSH enabled, then Packer provisions everything else. The macOS base ISO/IPSW is still version-tracked in vars files for reproducibility.

### D7: Implementation order
**Choice**: Linux x86 → Linux ARM → Windows → macOS x86 → macOS ARM.
**Rationale**: Linux is the simplest Packer automation (cloud-init just works). This lets us nail down the Makefile, test framework, and clone workflow before tackling platform-specific complexity.

## Risks / Trade-offs

**[macOS has no unattended install]** → Accept manual initial install + snapshot for macOS base. Document the manual steps clearly so they're reproducible. Packer handles provisioning after the manual OS install.

**[Large disk usage]** → Base images are 20-60GB each. 5 images = potentially 150-300GB total per machine. Mitigation: use VMware thin provisioning (images only use actual written space), clean up old images after rebuild.

**[Windows evaluation license expires]** → Windows 11 evaluation ISOs expire after 90 days. Mitigation: rebuild the image periodically, or use a volume license key if available. For QA purposes, the evaluation period is sufficient.

**[Architecture differences may mask bugs]** → Ubuntu ARM on M1 is a different arch than what most servers run (x86). Mitigation: x86 is the primary Linux target (on Intel Mac), ARM is supplementary.

**[VMware Fusion version drift]** → The two machines may run different VMware Fusion versions. Mitigation: pin a minimum version in README, use `vmx_version` in Packer to target a compatible hardware version.
