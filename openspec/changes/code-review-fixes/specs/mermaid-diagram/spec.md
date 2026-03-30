## MODIFIED Requirements

### Requirement: Mermaid diagram rendering
The MermaidBlock component SHALL accept a `code` string prop containing Mermaid diagram syntax, lazy-load the mermaid library via dynamic import, render the diagram to SVG using `mermaid.render()`, sanitize the SVG output using DOMPurify to remove script tags, event handlers, and other XSS vectors, and display the sanitized SVG inside a zoomable viewport container that spans the full content area width.

#### Scenario: Valid Mermaid diagram
- **WHEN** a mermaid code block contains valid Mermaid syntax (e.g., `graph TD; A-->B`)
- **THEN** the component SHALL render a sanitized SVG diagram inside a zoomable viewport container

#### Scenario: Loading state
- **WHEN** the mermaid library is being loaded via dynamic import
- **THEN** the component SHALL display a loading placeholder

#### Scenario: Invalid Mermaid syntax
- **WHEN** a mermaid code block contains invalid syntax
- **THEN** the component SHALL display the raw code text with an error message

#### Scenario: Multiple diagrams on same page
- **WHEN** multiple mermaid code blocks appear in the same markdown content
- **THEN** each diagram SHALL render independently with unique IDs, independent zoom state, and no conflicts

#### Scenario: Component unmounts during render
- **WHEN** the component unmounts while mermaid.render() is in progress
- **THEN** the stale render result SHALL be discarded without errors

#### Scenario: SVG contains malicious content
- **WHEN** mermaid.render() produces SVG containing `<script>` tags, `onload` attributes, or other XSS vectors
- **THEN** DOMPurify SHALL strip all executable content before DOM injection
- **AND** valid SVG elements (paths, text, groups) SHALL be preserved
