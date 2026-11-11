# Stable Immich images with embedded video chapters

This fork-specific workflow builds `linux/amd64` server images from published stable releases of `immich-app/immich`. The server image includes the web client. It does not deploy containers, update a running installation, open upstream PRs, or change upstream branches.

The workflow does not depend on synchronizing this fork's main branch. It resolves the latest stable upstream release directly, checks out its exact commit, applies a version-specific chapter patch, regenerates API clients, runs checks, and builds with the upstream `server/Dockerfile`.

## Images and updates

Images are published to `ghcr.io/arvidsagbrant/immich-server-chapters` with two tags:

- `v3.3.6-chapters`: the tested chapter image for that upstream release.
- `v3.3.6-chapters-<build-key>`: an immutable recipe tag identifying the upstream commit and automation/patch contents.

Use the immutable tag printed in the workflow summary when selecting an image for deployment. Keep the other Immich services on the corresponding upstream release. The recipe does not publish `latest` or automatically upgrade your installation.

The daily schedule runs at 04:23 UTC when the repository variable `CHAPTERS_AUTO_BUILD` equals `true`. It skips builds whose exact immutable image already exists. GitHub can disable scheduled workflows in inactive public forks; check Actions if updates stop appearing.

Manual runs accept `latest` or a published stable tag such as `v3.3.6`. Prereleases, branches, unpublished tags, and unsupported release series are rejected. Clear `publish` for a build-only validation run; no downloadable server image is exported in that mode. Select `force` to rebuild an already published recipe.

## Enable in this fork

The workflow and this directory must be committed to the fork's default branch (`main`). Enable GitHub Actions for the fork if required. The workflow uses `GITHUB_TOKEN` with `contents: read` and `packages: write`; it needs no upstream GitHub App credentials or personal access token secret.

```sh
gh variable set CHAPTERS_AUTO_BUILD --repo ArvidSagbrant/immich --body true
gh workflow run chapters.yml --repo ArvidSagbrant/immich -f release=latest -F publish=true
gh run list --repo ArvidSagbrant/immich --workflow chapters.yml
```

GHCR packages can initially be private even for a public repository. Set the package visibility to public if unauthenticated pulls are desired, or authenticate the deployment host to GHCR.

The original upstream Docker workflow is independent of this workflow and may require Immich-specific App secrets. This workflow does not use it.

## Patch maintenance

`recipes.json` selects the patch by stable release series. `v3.3.patch` adapts the feature to the stable release's SDK calls, `$lib` imports, and happy-dom test framework. `v3.4.patch` retains the newer query architecture and browser tests. The original feature implementation remains available in the local feature branch.

Generated OpenAPI and SDK files are intentionally excluded from both patches. The build runs `mise //:open-api` on the patched release to regenerate them against that release's API. This avoids applying old generated files over unrelated upstream API changes.

The hosted runner's JDK 21 is used for OpenAPI generation because the stable release requests Java without an entry in its mise lockfile. The remaining build tools are installed from upstream's locked versions.

Patch application first performs `git apply --check --whitespace=error` on a clean checkout. A conflict stops the workflow before source changes, verification, or publishing. There is no fuzzy conflict recovery, automatic conflict resolution, or partial chapter build. Test or build failures also prevent publishing.

For a new incompatible release, maintain the patch against a clean checkout of that release, run the feature checks, replace the appropriate patch, and update `tested_base`. For a new major version, add an explicit profile instead of removing the version guard. Keep this recipe directory when synchronizing fork branches.

Every successful build saves `chapters-build.json` as an Actions artifact, containing the upstream commit, patch/recipe hashes, image tag and digest. A failed patch run still preserves the resolved target in the artifact.

## Resources and validation

Builds run on GitHub-hosted Ubuntu, not on the workstation. Verification uses one worker at a time. BuildKit uses one parallel build operation with a 4 GB container memory limit and a 6 GB combined memory/swap limit. Registry build caching is scoped to this image.

BuildKit also limits concurrent registry connections to one. If an image build fails with a GHCR HTTP 429 rate limit, the workflow inspects the latest Buildx history record and retries on the same builder after 60 seconds, then 120 seconds. Cached work is reused; feature tests are not repeated. There are at most three build attempts. Other build failures, missing history, and exhausted retries fail the job and prevent recording the image as successfully built. Each attempt uses the same image tags, platform, cache and publication settings.

The recipe resolves and applies both patches using Python's standard library and Git. Its small unit tests cover release/profile selection, immutable tagging, serial verification commands, and conflict handling without partial writes.

```sh
mise -C .github/chapters run test
mise -C .github/chapters run lint
```

The lint task requires `actionlint`. Application checks run through the upstream mise tasks after patching. The stable profile runs relevant backend unit tests, database tests, web type/Svelte checks and chapter component tests. The modern profile also runs browser query and full-player playback tests.
