# Changelog
Document all changes to this project below using the following headings:

- Added
  for new features.
- Changed
  for changes in existing functionality.
- Deprecated
  for soon-to-be removed features.
- Fixed
  for any bug fixes.
- Removed
  for now removed features.
- Security
  in case of vulnerabilities.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

Make sure to add a link to the Pull Request and/or issue number (if applicable)

-------------------------------------------------------------------------------

<a name="unreleased"></a>
## [Unreleased]

### Added
- `CHANGELOG.md` file

-------------------------------------------------------------------------------

<a name="0.3.3"></a>
## [0.3.3] - 2025-07-27

### Fixed
- WebSocket connection failures when using proxied domain (`api.globalleaderboards.net`)
- Changed default WebSocket URL to use non-proxied subdomain (`ws.globalleaderboards.net`) to bypass Cloudflare HTTP/2 proxy limitations
- This fixes error 1006 WebSocket connection failures in browser environments

-------------------------------------------------------------------------------

