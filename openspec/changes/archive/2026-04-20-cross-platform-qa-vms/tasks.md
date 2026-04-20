## 1. Project Structure & Tooling

- [x] 1.1 Create `qa/` directory structure: `packer/`, `packer/scripts/`, `packer/http/`, `packer/vars/`, `tests/`
- [x] 1.2 Create `qa/Makefile` with target stubs for build, test, manual, clean
- [x] 1.3 Create `qa/README.md` with prerequisites (Packer, VMware Fusion, ISOs) and usage instructions
- [x] 1.4 Add `.gitignore` entries for VM output directories, ISOs, and Packer cache

## 2. Shared Provisioning Scripts

- [x] 2.1 Create `packer/scripts/provision-common.sh` — install nvm + Node.js LTS, verify `node` and `npm` on PATH
- [x] 2.2 Create `packer/scripts/provision-linux.sh` — apt update, install build-essential, curl, git; call provision-common.sh
- [x] 2.3 Create `packer/scripts/provision-macos.sh` — install Xcode CLI Tools, Homebrew, git; call provision-common.sh
- [x] 2.4 Create `packer/scripts/provision-windows.ps1` — install nvm-windows, Node.js LTS, Git for Windows, VS Build Tools (C++ workload)

## 3. Linux x86 Image (Ubuntu 24.04)

- [x] 3.1 Create `packer/http/user-data` cloud-init autoinstall config (user account, SSH key, locale)
- [x] 3.2 Create `packer/vars/ubuntu-24.pkrvars.hcl` with ISO URL, checksum, VM specs
- [x] 3.3 Create `packer/ubuntu-x86.pkr.hcl` — vmware-iso builder with cloud-init boot command, provisioners calling linux scripts
- [x] 3.4 Wire `make build-linux-x86` target, test full build from ISO to base image
- [x] 3.5 Verify base image: boot, SSH in, confirm node/git/gcc available (manual verification — requires VMware + ISO)

## 4. Linux ARM Image (Ubuntu 24.04)

- [x] 4.1 Create `packer/vars/ubuntu-24-arm.pkrvars.hcl` with ARM ISO URL and checksum
- [x] 4.2 Create `packer/ubuntu-arm.pkr.hcl` (or parameterize the x86 template with arch variable)
- [x] 4.3 Wire `make build-linux-arm` target, test build on M1 Mac

## 5. Windows Image (Windows 11)

- [x] 5.1 Create `packer/http/autounattend.xml` — unattended Windows 11 install (evaluation license, user account, enable OpenSSH)
- [x] 5.2 Create `packer/vars/win-11.pkrvars.hcl` with evaluation ISO URL, checksum, VM specs
- [x] 5.3 Create `packer/windows.pkr.hcl` — vmware-iso builder with floppy/http autounattend, provisioners calling PowerShell script
- [x] 5.4 Wire `make build-windows` target, test full build
- [x] 5.5 Verify base image: boot, SSH in (OpenSSH), confirm node/git/cl.exe available (manual verification)

## 6. macOS x86 Image (Sonoma 14)

- [x] 6.1 Document manual macOS VM install steps in `qa/README.md` (create VM, install OS, enable SSH, set user account)
- [x] 6.2 Create `packer/vars/macos-14.pkrvars.hcl` with VM name, SSH credentials, VM specs
- [x] 6.3 Create `packer/macos-x86.pkr.hcl` — vmware-vmx builder (starts from existing VM), provisioners calling macOS scripts
- [x] 6.4 Wire `make build-macos-x86` target, test provision on manually-installed VM

## 7. macOS ARM Image (Sonoma 14)

- [x] 7.1 Create `packer/vars/macos-14-arm.pkrvars.hcl` with ARM-specific settings
- [x] 7.2 Create `packer/macos-arm.pkr.hcl` (or parameterize the x86 template)
- [x] 7.3 Wire `make build-macos-arm` target, test provision on M1 Mac

## 8. VM Lifecycle (Clone/Boot/Discard)

- [x] 8.1 Create `qa/scripts/vm-clone.sh` — clone a base image using vmrun or vmware CLI, return clone path
- [x] 8.2 Create `qa/scripts/vm-wait-ssh.sh` — poll SSH port with configurable timeout (default 120s)
- [x] 8.3 Create `qa/scripts/vm-destroy.sh` — stop and delete a cloned VM
- [x] 8.4 Wire Makefile `test-*` targets: clone → boot → wait SSH → run tests → destroy
- [x] 8.5 Wire Makefile `manual-*` targets: clone → boot with GUI → user interacts → `clean-manual-*` destroys
- [x] 8.6 Wire Makefile `clean` target: stop and delete all clone VMs

## 9. Test Suite

- [x] 9.1 Create `tests/01-install.sh` — `npm install -g @blackbelt-technology/pi-dashboard`, verify exit code and `pi-dashboard --version`
- [x] 9.2 Create `tests/02-server-start.sh` — `pi-dashboard start`, curl health endpoint, verify HTTP 200
- [x] 9.3 Create `tests/03-websocket.sh` — connect to pi gateway (9999) and browser WS endpoint
- [x] 9.4 Create `tests/04-terminal.sh` — create terminal session via API, verify output received
- [x] 9.5 Create `tests/05-git-ops.sh` — init repo, verify branch list API returns results
- [x] 9.6 Create `tests/run-all.sh` — execute tests in order, collect results, print summary, exit code
- [x] 9.7 Create Windows equivalents: `tests/01-install.ps1`, `tests/run-all.ps1` (or a dispatcher that picks .sh/.ps1 per platform)

## 10. Documentation & Integration

- [x] 10.1 Complete `qa/README.md` with full build/test/manual instructions per platform
- [x] 10.2 Add QA section to project `AGENTS.md` with key files and commands
- [x] 10.3 End-to-end validation: run full test suite on Linux x86 VM from scratch (manual — requires VMware + ISO)
