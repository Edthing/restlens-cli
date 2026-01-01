# @restlens/cli

CLI for [REST Lens](https://restlens.com) API evaluation.

## Installation

```bash
npx @restlens/cli@latest <command>
```

Or install globally:

```bash
npm install -g @restlens/cli
```

## Usage

### Authentication

```bash
# Opens browser for OAuth login
restlens auth
```

Credentials are stored in `~/.restlens/auth.json`.

### Evaluate a Specification

```bash
# Upload, wait for evaluation, and show violations
restlens eval ./openapi.yaml -p my-org/my-project

# With version tag
restlens eval ./openapi.yaml -p my-org/my-project --tag v1.0.0
```

### Other Commands

```bash
# Just upload (don't wait for results)
restlens upload ./openapi.yaml -p my-org/my-project

# Get violations for latest spec
restlens violations -p my-org/my-project

# List your projects
restlens projects

# Check auth status
restlens status

# Logout
restlens logout
```

## Options

All commands support:
- `--server <url>` - Use a different REST Lens server (default: https://restlens.com)

## Multi-Server Support

For non-production servers, set the `RESTLENS_URL` environment variable:

```bash
export RESTLENS_URL=https://staging.restlens.com
restlens auth
restlens eval ./openapi.yaml -p my-org/my-project
```

Alternatively, use the `--server` flag on each command:

```bash
restlens auth --server https://staging.restlens.com
restlens eval ./openapi.yaml -p my-org/my-project --server https://staging.restlens.com
```

Tokens are stored per-server in `~/.restlens/auth.json`.

## License

GPL-3.0-only
