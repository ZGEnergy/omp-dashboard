## ADDED Requirements

### Requirement: Packer builds Ubuntu x86 base image
The system SHALL provide a Packer HCL template that builds an Ubuntu 24.04 x86_64 VMware image from an ISO, with cloud-init autoinstall, and provisions Node.js (LTS via nvm), Git, and build-essential.

#### Scenario: Successful Ubuntu x86 build
- **WHEN** the user runs `make build-linux-x86`
- **THEN** Packer downloads the Ubuntu ISO (if not cached), boots the VM, performs unattended install via cloud-init, provisions prereqs, and outputs a `.vmdk` base image

#### Scenario: Ubuntu x86 image has prereqs
- **WHEN** the Ubuntu x86 base image boots
- **THEN** `node --version` returns the LTS version, `git --version` succeeds, and `gcc --version` succeeds

### Requirement: Packer builds Ubuntu ARM base image
The system SHALL provide a Packer HCL template that builds an Ubuntu 24.04 aarch64 VMware image on the M1 Mac, using the ARM server ISO.

#### Scenario: Successful Ubuntu ARM build
- **WHEN** the user runs `make build-linux-arm` on the M1 Mac
- **THEN** Packer builds an Ubuntu ARM base image with the same prereqs as the x86 variant

### Requirement: Packer builds Windows x86 base image
The system SHALL provide a Packer HCL template that builds a Windows 11 x86_64 VMware image from an evaluation ISO, using `autounattend.xml` for unattended install, and provisions Node.js (LTS via nvm-windows), Git for Windows, and Visual Studio Build Tools (C++ workload).

#### Scenario: Successful Windows build
- **WHEN** the user runs `make build-windows`
- **THEN** Packer builds a Windows 11 base image with unattended install and all prereqs

#### Scenario: Windows image has prereqs
- **WHEN** the Windows base image boots
- **THEN** `node --version` returns the LTS version, `git --version` succeeds, and `cl.exe` is available via VS Build Tools

### Requirement: Packer builds macOS x86 base image
The system SHALL provide a Packer HCL template that provisions a manually-installed macOS 14 x86_64 VMware VM with Node.js (LTS via nvm), Git, Homebrew, and Xcode Command Line Tools.

#### Scenario: Successful macOS x86 provision
- **WHEN** the user has a manually-installed macOS VM with SSH enabled and runs `make build-macos-x86`
- **THEN** Packer provisions the VM with all prereqs and creates a base snapshot

### Requirement: Packer builds macOS ARM base image
The system SHALL provide a Packer HCL template that provisions a manually-installed macOS 14 aarch64 VMware VM on the M1 Mac.

#### Scenario: Successful macOS ARM provision
- **WHEN** the user has a manually-installed macOS ARM VM with SSH enabled and runs `make build-macos-arm` on the M1 Mac
- **THEN** Packer provisions the VM with all prereqs and creates a base snapshot

### Requirement: Variable files per OS version
The system SHALL provide `.pkrvars.hcl` files that isolate OS-version-specific values (ISO URL, checksum, VM settings) so images are rebuildable when OS versions change.

#### Scenario: Upgrading Ubuntu version
- **WHEN** the user updates `vars/ubuntu-24.pkrvars.hcl` with a new ISO URL and checksum
- **THEN** `make build-linux-x86` produces a new base image with the updated OS version

### Requirement: Shared provisioning scripts
The system SHALL provide a common provisioning script for nvm + Node.js LTS installation, reused across Linux and macOS Packer templates.

#### Scenario: Common script installs Node
- **WHEN** the common provision script runs on a Linux or macOS VM
- **THEN** nvm is installed, Node.js LTS is activated, and `node` and `npm` are on the PATH for the test user
