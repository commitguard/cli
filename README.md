# CommitGuard

Protect your codebase with every commit. CommitGuard automatically analyzes your code for security vulnerabilities, performance issues, and code quality problems before they enter your repository. Grab your free API key at https://commitguard.ai.

## Installation

Get CommitGuard running in under 60 seconds. It works seamlessly with any git repository and integrates automatically with VSCode and other git clients.

### Quick Start

**1. Install CommitGuard globally**

```bash
npm install -g @commitguard/cli
```

**2. Navigate to your project**

```bash
cd your-project
```

**3. Initialize CommitGuard**

```bash
commitguard init
```

**4. Commit as usual**

CommitGuard now runs automatically on every commit. It works with all git integrations including VSCode, terminal, and other git clients.

```bash
git commit -m "Add new feature"
[CommitGuard] Analyzing commit...
✓ Commit passed all checks
```

## Usage

### Bypassing Checks

To bypass CommitGuard checks for a specific commit, add `--skip` to your commit message:

```bash
git commit -m "Add new feature --skip"
```

The `--skip` flag is automatically removed from the final commit message. When using git in your terminal, you'll be prompted to confirm if you want to bypass checks.

### Configuring Checks

View or update CommitGuard preferences for your repository:

```bash
commitguard config
```

On the Pro plan, you can add custom rules through the config comand.

## CLI Commands

### `commitguard init`

Install CommitGuard in your current repository.

```bash
$ commitguard init
✓ CommitGuard installed successfully
```

### `commitguard remove`

Remove CommitGuard from the current repository.

```bash
$ commitguard remove
✓ CommitGuard removed
```

### `commitguard config`

View or update CommitGuard preferences for the current repository. Pro plan users can add custom rules.

```bash
$ commitguard config
Select enabled checks for this project:
Security, Performance, Code Quality, Architecture
```

### `commitguard keys`

Manage your global API key for CommitGuard.

```bash
$ commitguard keys
Current API key: sk-ant-***************
```

## What Happens After Installation?

- Every commit is analyzed before it's created.
- No config files are added to your project
- Bypass checks anytime with `--skip` in your commit message
- Works seamlessly with all git clients and IDEs

## Troubleshooting

<details>
<summary><strong>CommitGuard isn't running on commits</strong></summary>

Try reinstalling the hooks:

```bash
commitguard remove
commitguard init
```

Verify that the hooks are installed:

```bash
ls -la .git/hooks/
```

You should see a `pre-commit` hook file.
</details>

<details>
<summary><strong>How do I skip a single commit?</strong></summary>

Add `--skip` to your commit message:

```bash
git commit -m "Emergency fix --skip"
```

The `--skip` flag is automatically removed from the final message.
</details>

<details>
<summary><strong>How do I completely remove CommitGuard?</strong></summary>

Remove the hooks and uninstall the package:

```bash
commitguard remove
npm uninstall -g @commitguard/cli
```
</details>

## Features

- **Security Analysis** - Detect vulnerabilities before they reach your repo
- **Performance Checks** - Identify performance bottlenecks early
- **Code Quality** - Maintain consistent code standards
- **Architecture Review** - Ensure architectural patterns are followed
- **Zero Configuration** - Works out of the box
- **Universal Compatibility** - Works with any git workflow
-- **Custom Rules** - Add your own custom checks to the code reviews

## Support

For issues, feature requests, or questions related to this package please open an issue or email us at hello@commitguard.ai

## License

MIT
