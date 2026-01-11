# IgnoreLens

A VS Code extension that shows how many files each ignore line matches and highlights redundant lines.

It tracks a running count of ignored files (the number in brackets). Normal lines add to this count, while negation lines (`!`) remove from it.

![IgnoreLens screenshot](images/screenshot.png)

## Usage

IgnoreLens activates automatically for its 47 supported file types. The majority of these follow the .gitignore syntax.

To use with any file, change its language mode to `ignore` via the status bar or command palette (Ctrl+Shift+P → "Change Language Mode"). 

## Match Counts

IgnoreLens decorates each line depending upon how it affects the running count of workspace files.

| Symbol | Meaning |
|--------|---------|
| `+N` | Files added to running count |
| `−N` | Files removed from running count |
| `(N)` | Running count total |
| `≡N` | Already counted (shadowed by earlier line) |
| `∅N` | Not in count (no matches) |
| `✗N` | Blocked by parent directory |

Counts are colour-coded:
- **Green**: Line is adding files
- **Yellow**: Negation line, or shadowed line (files already ignored by earlier line)
- **Red**: Redundant line (matches nothing)

### Real-time Updates

Decorations update automatically when you edit the file or when workspace files change.

## Supported Files

IgnoreLens supports **47 ignore file formats** with accurate semantics:

### Gitignore-Compliant Formats (38)

Standard gitignore rules apply:
- `*` matches anything except `/`, `**` matches any path including `/`, `?` matches single character
- `*.ext` matches at any depth (basename matching)
- `dir/` directory pattern, blocks negations for files inside
- `!pattern` negation (un-ignore), `#` comment
- Trims trailing spaces only (tabs preserved)

| File | Tool/Platform | Docs |
|------|---------------|------|
| | **Version Control** | |
| `.gitignore` | Git | [gitignore](https://git-scm.com/docs/gitignore) |
| | **AI Coding Tools** | |
| `.aiderignore` | Aider | [aider](https://aider.chat/docs/faq.html) |
| `.aiexclude` | Gemini Code Assist | [aiexclude](https://docs.cloud.google.com/gemini/docs/codeassist/create-aiexclude-file) |
| `.aiignore` | JetBrains AI | [AI Assistant](https://www.jetbrains.com/help/ai-assistant/disable-ai-assistant.html) |
| `.augmentignore` | Augment Code | [augmentcode](https://www.augmentcode.com/) |
| `.clineignore` | Cline | [cline](https://github.com/cline/cline) |
| `.codeiumignore` | Windsurf/Codeium | [windsurf](https://windsurf.com/) |
| `.cursorignore` | Cursor | [cursor](https://cursor.com/) |
| `.geminiignore` | Gemini CLI | [gemini-ignore](https://geminicli.com/docs/cli/gemini-ignore/) |
| `.tabnineignore` | Tabnine | [tabnine](https://docs.tabnine.com/) |
| | **Build & Package** | |
| `.bazelignore` | Bazel (build system) | [bazelrc](https://bazel.build/run/bazelrc) |
| `.distignore` | WordPress CLI | [dist-archive](https://developer.wordpress.org/cli/commands/dist-archive/) |
| `.helmignore` | Helm (Kubernetes) | [helm ignore](https://helm.sh/docs/chart_template_guide/helm_ignore_file/) |
| `.swagger-codegen-ignore` | Swagger Codegen | [swagger codegen](https://swagger.io/docs/open-source-tools/swagger-codegen/) |
| `.yarnignore` | Yarn | [yarn pack](https://classic.yarnpkg.com/en/docs/cli/pack/) |
| | **Cloud & Deployment** | |
| `.cfignore` | Cloud Foundry | [deploy guide](https://docs.cloudfoundry.org/devguide/deploy-apps/prepare-to-deploy.html) |
| `.deployignore` | DeployHQ | [excluded files](https://www.deployhq.com/support/excluded-files) |
| `.ebignore` | AWS Elastic Beanstalk | [EB CLI config](https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb-cli3-configuration.html) |
| `.slugignore` | Heroku | [slug compiler](https://devcenter.heroku.com/articles/slug-compiler) |
| `.terraformignore` | Terraform | [cloud settings](https://developer.hashicorp.com/terraform/cli/cloud/settings) |
| `.upignore` | Up (serverless) | [apex/up](https://github.com/apex/up) |
| `.vercelignore` | Vercel | [vercel ignore](https://vercel.com/docs/deployments/vercel-ignore) |
| | **Code Formatters** | |
| `.prettierignore` | Prettier | [ignoring code](https://prettier.io/docs/ignore) |
| | **Frameworks** | |
| `.eleventyignore` | Eleventy (SSG) | [ignores](https://www.11ty.dev/docs/ignores/) |
| `.nodemonignore` | nodemon | [nodemon](https://github.com/remy/nodemon) |
| `.nuxtignore` | Nuxt | [nuxtignore](https://nuxt.com/docs/guide/directory-structure/nuxtignore) |
| | **Linters** | |
| `.alexignore` | alex (writing linter) | [alex](https://github.com/get-alex/alex) |
| `.eslintignore` | ESLint | [ignore config](https://eslint.org/docs/latest/use/configure/ignore-deprecated) |
| `.jshintignore` | JSHint | [CLI options](https://jshint.com/docs/cli/) |
| `.markdownlintignore` | markdownlint | [markdownlint](https://github.com/DavidAnson/markdownlint) |
| `.solhintignore` | Solhint (Solidity) | [solhint](https://protofire.github.io/solhint/) |
| `.stylelintignore` | Stylelint | [ignore code](https://stylelint.io/user-guide/ignore-code/) |
| `.stylintignore` | Stylint | [stylint](https://github.com/SimenB/stylint) |
| | **Misc.** | |
| `.flooignore` | Floobits | [floobits-sublime](https://github.com/Floobits/floobits-sublime) |
| `.ignore` | ripgrep/fd/etc | [ripgrep](https://github.com/BurntSushi/ripgrep) |
| `.jpmignore` | Mozilla Jetpack | [jpm](https://github.com/mozilla-jetpack/jpm) |
| `.rgignore` | ripgrep | [ripgrep](https://github.com/BurntSushi/ripgrep) |
| `.tokeignore` | Tokei (code stats) | [tokei](https://github.com/XAMPPRocky/tokei) |

### Other Supported Formats (9)

| File | Tool/Platform | Notes | Docs |
|------|---------------|-------|------|
| `.bzrignore` | Bazaar (VCS) | `!` is literal | [controlling registration](http://doc.bazaar.canonical.com/latest/en/user-guide/controlling_registration.html) |
| `.chefignore` | Chef (config mgmt) | `!` is literal | [chef repo](https://docs.chef.io/chef_repo/) |
| `.cvsignore` | CVS (VCS) | No `#` comments, `!` is literal | [cvsignore](https://www.gnu.org/software/trans-coord/manual/cvs/html_node/cvsignore.html) |
| `.dockerignore` | Docker | Leading `/` stripped | [build context](https://docs.docker.com/build/concepts/context/) |
| `.gcloudignore` | Google Cloud | `*.ext` root only | [gcloudignore](https://cloud.google.com/sdk/gcloud/reference/topic/gcloudignore) |
| `.npmignore` | npm | `*.ext` root only | [npm developers](https://docs.npmjs.com/cli/v9/using-npm/developers/) |
| `.p4ignore` | Perforce (VCS) | `*.ext` root only (first-match-wins) | [P4IGNORE](https://www.perforce.com/manuals/cmdref/Content/CmdRef/P4IGNORE.html) |
| `.tfignore` | Team Foundation (VCS) | `\` anchors to root, no dir blocking | [TFVC ignore](https://learn.microsoft.com/en-us/azure/devops/repos/tfvc/add-files-server) |
| `.vscodeignore` | VS Code Extension API | `*.ext` root only, trims all whitespace | [publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) |

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

```jsonc
{
  "workbench.colorCustomizations": {
    "ignorelens.noMatchForeground": "#f14c4c",         // Red text for redundant lines
    "ignorelens.noMatchBackground": "#4a1a1a40",       // Red background for redundant lines
    "ignorelens.matchCountForeground": "#6A9955",      // Green text for matching lines
    "ignorelens.negationForeground": "#CCAA00",        // Yellow text for negation lines
    "ignorelens.staleMatchCountForeground": "#3d5c30", // Stale: darker green
    "ignorelens.staleNoMatchForeground": "#8b2020",    // Stale: darker red
    "ignorelens.staleNoMatchBackground": "#2a0a0a40",  // Stale: darker red background
    "ignorelens.staleNegationForeground": "#7a6600"    // Stale: darker yellow
  }
}
```

The `stale` colours are shown briefly when switching tabs while cached data refreshes.

## Limitations / Notes

- **Each file is analysed independently.** IgnoreLens doesn't consider how multiple ignore files interact. For example, ripgrep allows `.rgignore` to override `.gitignore` rules, but IgnoreLens shows each file's matches in isolation.

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
