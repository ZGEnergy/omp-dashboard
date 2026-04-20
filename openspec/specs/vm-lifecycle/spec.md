# vm-lifecycle Specification

## Purpose
TBD - created by archiving change cross-platform-qa-vms. Update Purpose after archive.
## Requirements
### Requirement: Clone base image for test run
The system SHALL clone a base image into a disposable VM before each test run using VMware linked clones for speed and space efficiency.

#### Scenario: Clone and boot for testing
- **WHEN** the user runs `make test-linux-x86`
- **THEN** the Makefile clones the Linux x86 base image, boots the clone, waits for SSH readiness, and proceeds to run tests

#### Scenario: Clone is discarded after test
- **WHEN** the test run completes (pass or fail)
- **THEN** the cloned VM is stopped and deleted

### Requirement: Manual interactive VM access
The system SHALL provide a Makefile target to clone a base image and open it with VMware GUI for manual interactive use.

#### Scenario: Launch manual session
- **WHEN** the user runs `make manual-linux-x86`
- **THEN** a clone of the Linux x86 base image boots with VMware GUI visible, and the user can interact with it

#### Scenario: Discard manual session
- **WHEN** the user is done and runs `make clean-manual-linux-x86`
- **THEN** the manual clone VM is stopped and deleted

### Requirement: SSH readiness wait
The system SHALL wait for SSH to become available on a cloned VM before executing tests, with a configurable timeout.

#### Scenario: SSH becomes available
- **WHEN** a cloned VM is booted
- **THEN** the system polls SSH (port 22) until connection succeeds or timeout (default 120 seconds) is reached

#### Scenario: SSH timeout
- **WHEN** SSH does not become available within the timeout
- **THEN** the system reports an error, stops the clone, and exits with a non-zero code

### Requirement: Clean all clones
The system SHALL provide a `make clean` target that stops and deletes all cloned VMs (test and manual), leaving base images intact.

#### Scenario: Clean all
- **WHEN** the user runs `make clean`
- **THEN** all running clone VMs are stopped and their disk images deleted

