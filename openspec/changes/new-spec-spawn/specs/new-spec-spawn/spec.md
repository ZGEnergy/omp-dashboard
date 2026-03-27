## ADDED Requirements

### Requirement: New Spec button on folder OpenSpec section
The `FolderOpenSpecSection` SHALL include a "New Spec" button that spawns a new pi session with `/opsx:explore` as the initial prompt for the folder's directory.

#### Scenario: New Spec button visible
- **WHEN** a folder group has OpenSpec initialized
- **THEN** a "New Spec" button SHALL be visible in the folder OpenSpec section header

#### Scenario: New Spec button spawns explore session
- **WHEN** the user clicks "New Spec" on folder `/project/foo`
- **THEN** the browser SHALL send `{ type: "spawn_session", cwd: "/project/foo", initialPrompt: "/opsx:explore" }`

#### Scenario: Spawned session appears in folder
- **WHEN** the server spawns a pi session with initial prompt for cwd `/project/foo`
- **THEN** the session SHALL appear in the `/project/foo` folder group once its bridge connects

### Requirement: Auto-attach proposal created during explore
When a pi agent in explore mode creates a new OpenSpec change, the activity detector SHALL detect the change name immediately, and the server's existing auto-attach logic SHALL attach it to the creating session.

#### Scenario: Explore agent creates proposal
- **WHEN** a session is in explore phase (`openspecPhase = "explore"`) and the agent runs `openspec new change "my-feature"`
- **THEN** the activity detector SHALL detect `changeName = "my-feature"` from the Bash command
- **AND** the server SHALL auto-attach `"my-feature"` to the session (since phase and changeName are both set)

#### Scenario: Change name detected at creation time
- **WHEN** the agent runs `openspec new change "my-feature"` (positional argument, no `--change` flag)
- **THEN** the activity detector SHALL match the command and extract `"my-feature"` as the change name
