# Plastic SCM Slack Bot

A Node.js server that forwards Plastic SCM notifications to Slack channels. It processes file changes from Plastic SCM
and formats them into readable Slack messages with appropriate icons and threading.

## Features

- Forwards Plastic SCM notifications to Slack
- Groups file changes by action type (Added, Changed, Deleted, Renamed, Moved)
- Supports multiple Slack channels
- Uses threaded messages for better organization
- Includes file icons for better visualization (📁 for directories, 📝 for files)
- Health check endpoints
- Docker support with multi-architecture builds (amd64/arm64)

## Environment Variables

| Variable        | Description                                 | Required |
|-----------------|---------------------------------------------|----------|
| `SLACK_TOKEN`   | Slack Bot User OAuth Token                  | Yes      |
| `SLACK_CHANNEL` | Default Slack channel (for legacy endpoint) | No       |
| `PORT`          | Server port (default: 3000)                 | No       |
| `LOG_LEVEL`     | Winston logger level (default: debug)       | No       |

## Installation

### Using Docker

```bash
docker pull ghcr.io/your-username/plastic-slack-bot:latest
docker run -e SLACK_TOKEN=xoxb-your-token -p 3000:3000 ghcr.io/your-username/plastic-slack-bot:latest
```

### Manual Setup

```bash
npm install
npm start
```

## API Endpoints

### Send Notification to Specific Channel

```
POST /notify/:channel
```

### Send Notification to Default Channel

```
POST /notify
```

### Health Checks

```
GET /health
GET /healthz
```

## Request Format

```json
{
  "PLASTIC_USER": "username",
  "PLASTIC_CLIENTMACHINE": "machine-name",
  "content": "Commit message or description",
  "INPUT": "[\"AD \\\"/path/to/file\\\" FILE#metadata\"]"
}
```

## GitHub Actions

The project includes GitHub Actions workflow for:

- Building multi-architecture Docker images
- Publishing to GitHub Container Registry
- Automatic versioning based on tags
- CI/CD pipeline for PRs and pushes to master

## License

MIT
