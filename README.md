# IgnoreLens

A VS Code extension that shows how many files each ignore line matches and highlights redundant lines. 

It tracks a running count of ignored files (the number in brackets) and normal lines add to this count while negation lines (`!`) remove from it.

![IgnoreLens screenshot](images/screenshot.png)

## Usage

IgnoreLens activates automatically for its 36 supported file types.  The majority of these follow the .gitignore syntax.

To use with any file, change its language mode to `ignore` via the status bar or command palette (Ctrl+Shift+P → "Change Language Mode"). 

## Match Counts

IgnoreLens decorates each line depending upon how it affects the running count of in-scope files.

| Symbol | Meaning || Symbol | Meaning || Symbol | Meaning |
|--------|---------|--|--------|---------|--|--------|---------|
| `+N` | Files added || `(N)` | Running count || `≡N` | Already counted (shadowed) |
| `−N` | Files removed || | || `∅N` | Not counted |
| | || | || `✗N` | Blocked by parent directory |

Counts are colour-coded:
- **Green**: Line is adding files
- **Yellow**: Negation line, or shadowed line (files already ignored by earlier line)
- **Red**: Redundant line (matches nothing)

### Real-time Updates

Decorations update automatically when you edit the file or when workspace files change.

## Supported Syntax

Standard gitignore syntax is supported:

| Pattern | Description |
|---------|-------------|
| `*` | Matches anything except `/` |
| `**` | Matches any path including `/` |
| `?` | Matches any single character |
| `!pattern` | Negation (un-ignore) |
| `dir/` | Directory pattern |
| `#` | Comment |

## Supported Files

IgnoreLens supports **36 ignore file formats** with accurate semantics:

### Gitignore-Compliant Formats (27)

Standard gitignore rules: `*.ext` matches at any depth (basename matching), `dir/` blocks negations, trims trailing spaces only (tabs preserved).

| File | Tool/Platform | Docs |
|------|---------------|------|
| `.alexignore` | alex (writing linter) | [alex](https://github.com/get-alex/alex) |
| `.bazelignore` | Bazel (build system) | [bazelrc](https://bazel.build/run/bazelrc) |
| `.cfignore` | Cloud Foundry | [deploy guide](https://docs.cloudfoundry.org/devguide/deploy-apps/prepare-to-deploy.html) |
| `.deployignore` | DeployHQ | [excluded files](https://www.deployhq.com/support/excluded-files) |
| `.distignore` | WordPress CLI | [dist-archive](https://developer.wordpress.org/cli/commands/dist-archive/) |
| `.ebignore` | AWS Elastic Beanstalk | [EB CLI config](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb-cli3-configuration.html) |
| `.eleventyignore` | Eleventy (SSG) | [ignores](https://www.11ty.dev/docs/ignores/) |
| `.eslintignore` | ESLint | [ignore config](https://eslint.org/docs/latest/use/configure/ignore-deprecated) |
| `.flooignore` | Floobits | [floobits-sublime](https://github.com/Floobits/floobits-sublime) |
| `.gitignore` | Git | [gitignore](https://git-scm.com/docs/gitignore) |
| `.helmignore` | Helm (Kubernetes) | [helm ignore](https://helm.sh/docs/chart_template_guide/helm_ignore_file/) |
| `.jpmignore` | Mozilla Jetpack | [jpm](https://github.com/mozilla-jetpack/jpm) |
| `.jshintignore` | JSHint | [CLI options](https://jshint.com/docs/cli/) |
| `.markdownlintignore` | markdownlint | [markdownlint](https://github.com/DavidAnson/markdownlint) |
| `.nodemonignore` | nodemon | [nodemon](https://github.com/remy/nodemon) |
| `.nuxtignore` | Nuxt | [nuxtignore](https://nuxt.com/docs/guide/directory-structure/nuxtignore) |
| `.prettierignore` | Prettier | [ignoring code](https://prettier.io/docs/ignore) |
| `.slugignore` | Heroku | [slug compiler](https://devcenter.heroku.com/articles/slug-compiler) |
| `.solhintignore` | Solhint (Solidity) | [solhint](https://protofire.github.io/solhint/) |
| `.stylelintignore` | Stylelint | [ignore code](https://stylelint.io/user-guide/ignore-code/) |
| `.stylintignore` | Stylint | [stylint](https://github.com/SimenB/stylint) |
| `.swagger-codegen-ignore` | Swagger Codegen | [swagger codegen](https://swagger.io/docs/open-source-tools/swagger-codegen/) |
| `.terraformignore` | Terraform | [cloud settings](https://developer.hashicorp.com/terraform/cli/cloud/settings) |
| `.tokeignore` | Tokei (code stats) | [tokei](https://github.com/XAMPPRocky/tokei) |
| `.upignore` | Up (serverless) | [apex/up](https://github.com/apex/up) |
| `.vercelignore` | Vercel | [vercel ignore](https://vercel.com/docs/deployments/vercel-ignore) |
| `.yarnignore` | Yarn | [yarn pack](https://classic.yarnpkg.com/en/docs/cli/pack/) |

### Other Supported Formats (9)

| File | Tool/Platform | Notes | Docs |
|------|---------------|-------|------|
| `.bzrignore` | Bazaar (VCS) | Glob patterns, `!` treated as literal | [controlling registration](http://doc.bazaar.canonical.com/latest/en/user-guide/controlling_registration.html) |
| `.chefignore` | Chef (config mgmt) | Glob patterns, `!` treated as literal | [chef repo](https://docs.chef.io/chef_repo/) |
| `.cvsignore` | CVS (VCS) | No `#` comments, no negation, `!` clears the list | [cvsignore](https://www.gnu.org/software/trans-coord/manual/cvs/html_node/cvsignore.html) |
| `.dockerignore` | Docker | Minimatch-style but leading/trailing `/` stripped | [build context](https://docs.docker.com/build/concepts/context/) |
| `.gcloudignore` | Google Cloud | `*.ext` matches root only, negations always work | [gcloudignore](https://cloud.google.com/sdk/gcloud/reference/topic/gcloudignore) |
| `.npmignore` | npm | `*.ext` matches root only, negations always work | [npm developers](https://docs.npmjs.com/cli/v9/using-npm/developers/) |
| `.p4ignore` | Perforce (VCS) | `*.ext` matches root only; tool uses first-match-wins | [P4IGNORE](https://www.perforce.com/manuals/cmdref/Content/CmdRef/P4IGNORE.html) |
| `.tfignore` | Team Foundation (VCS) | Gitignore-style but `\` for root anchor instead of `/`, no directory blocking | [TFVC ignore](https://learn.microsoft.com/en-us/azure/devops/repos/tfvc/add-files-server) |
| `.vscodeignore` | VS Code Extension API | `*.ext` matches root only, `dir/` expands to `dir/**`, negations always work, trims all whitespace | [publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) |

## Configuration

Access settings via File → Preferences → Settings (or `Ctrl+,`) and search for "ignorelens".

| Setting | Description | Default |
|---------|-------------|---------|
| `ignorelens.enabled` | Enable or disable decorations | `true` |
| `ignorelens.decorationStyle` | How to highlight redundant lines: `none`, `background`, `text`, or `both` | `text` |
| `ignorelens.showMatchCount` | Show match counts after each line | `true` |
| `ignorelens.scanDebounceMs` | Delay before rescanning after changes (ms) | `500` |
| `ignorelens.debug` | Enable debug logging to Output panel | `false` |

### Customising Colours

Add to your `settings.json`:

```json
{
  "workbench.colorCustomizations": {
    "ignorelens.noMatchForeground": "#f14c4c",
    "ignorelens.noMatchBackground": "#4a1a1a40",
    "ignorelens.matchCountForeground": "#6A9955",
    "ignorelens.negationForeground": "#CCAA00",
    "ignorelens.staleMatchCountForeground": "#3d5c30",
    "ignorelens.staleNoMatchForeground": "#8b2020",
    "ignorelens.staleNoMatchBackground": "#2a0a0a40",
    "ignorelens.staleNegationForeground": "#7a6600"
  }
}
```

The `stale` colours are shown briefly when switching tabs while cached data refreshes.

## Limitations

- **Empty directories are not detected.** Directories are discovered by scanning files, so lines targeting empty directories will show zero matches even if the directory exists.

- **Hidden files are included in counts.** Files with the hidden attribute (Windows), hidden flag (macOS), or starting with `.` (Linux/Unix) are counted like regular files.

## Technology Stack

- **Language:** TypeScript 5.3.0+
- **Framework:** VS Code Extension API (1.85.0+)
- **Key Libraries:**
  - `ignore` (5.3.0+) - Gitignore pattern matching
  - `minimatch` (10.1.1) - Glob pattern matching for vscodeignore

## Acknowledgements

Developed with assistance from:
- [Claude Code](https://claude.ai/code) (Opus 4.5)
- [OpenAI Codex](https://openai.com/index/openai-codex/) (GPT-5.1-Codex-Max & GPT-5.2-Codex-Max)

Thanks to:
- [GitSparTV](https://github.com/GitSparTV) for identifying the running count tracking issue.
- [RedCMD](https://github.com/RedCMD) for identifying the [a].ts wildcard and trailing tab issues.

## Licence

MIT License - Copyright (c) 2025 Jason Gordon

Free to use, modify, and distribute. See [LICENSE](LICENSE) for details.
