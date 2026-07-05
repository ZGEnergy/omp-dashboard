## ADDED Requirements

### Requirement: Plugin sections on the DirectorySettings surface

The dashboard SHALL provide a `folder-settings-section` plugin slot (react-only, multiplicity many) hosted by the DirectorySettings surface (`/folder/:cwd/settings`). Each claimed section SHALL receive the folder's `cwd` as a prop and SHALL render within the folder settings page, ordered by claim priority. The slot SHALL NOT render anything on the workspace folder card or session cards.

#### Scenario: Claimed section renders with cwd
- **WHEN** a plugin claims `folder-settings-section` and the user opens `/folder/:cwd/settings`
- **THEN** the claimed component SHALL render on the page and receive that folder's `cwd` as a prop

#### Scenario: No claims, no artifacts
- **WHEN** no plugin claims `folder-settings-section`
- **THEN** the DirectorySettings surface SHALL render exactly as before the slot existed

#### Scenario: Multiple claims order by priority
- **WHEN** two plugins claim `folder-settings-section` with different priorities
- **THEN** the sections SHALL render in priority order
