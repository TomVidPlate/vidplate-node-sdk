# Releasing

1. Update generated operations from the upstream API generator when required.
2. Update package.json, package-lock.json and SDK_VERSION in src/client.ts together. Add release notes to CHANGELOG.md.
3. Run npm ci, npm run prepublishOnly and npm pack --dry-run. Review the package file list.
4. Merge the reviewed changes, then push a matching vX.Y.Z tag. The release workflow checks the versions, runs validation and attaches the built npm tarball to a GitHub release.
5. Publish to npm separately with npm publish --access public and complete 2FA. Verify npm view @vidplate/api version and a clean install before announcing availability.

GitHub releases do not publish to npm automatically. Configure npm Trusted Publishing for this repository before adding automated npm publication. Never commit npm tokens or API keys.
