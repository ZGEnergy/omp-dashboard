## MODIFIED Requirements

### Requirement: OAuth callback handling
The `/auth/callback/:provider` route SHALL exchange the authorization code for an access token, fetch user info, check the allowlist, and either set a session cookie and redirect, or show an access denied page.

The access denied page SHALL HTML-escape all user-provided data (email address, username) before interpolating into the HTML response to prevent XSS attacks. The server SHALL use an `escapeHtml()` helper that encodes `&`, `<`, `>`, `"`, and `'` as their HTML entity equivalents.

#### Scenario: Successful OAuth callback
- **WHEN** the callback receives a valid authorization code and the user is allowed
- **THEN** the server SHALL set a signed JWT cookie and redirect to the return URL encoded in the `state` parameter

#### Scenario: Access denied — email not in allowlist
- **WHEN** the callback receives a valid code but the user's email is not in `allowedUsers`
- **THEN** the server SHALL return a 403 response with an HTML page showing the denied email
- **AND** the email SHALL be HTML-escaped to prevent XSS

#### Scenario: Access denied — crafted email with HTML
- **WHEN** an OIDC provider returns an email like `<script>alert(1)</script>@evil.com`
- **THEN** the denied page SHALL render the escaped string `&lt;script&gt;alert(1)&lt;/script&gt;@evil.com`
- **AND** no script SHALL execute in the browser
