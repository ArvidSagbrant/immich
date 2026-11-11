import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent
RECIPES = json.loads((ROOT / "recipes.json").read_text())
BACKEND_TESTS = [
    "src/utils/chapters.spec.ts",
    "src/repositories/media.repository.spec.ts",
    "src/services/metadata.service.spec.ts",
    "src/services/asset.service.spec.ts",
    "src/controllers/asset.controller.spec.ts",
    "src/controllers/index.spec.ts",
]
WEB_TESTS = [
    "src/lib/components/asset-viewer/VideoChapterMenu.spec.ts",
    "src/lib/components/asset-viewer/VideoTimeline.spec.ts",
]


def run(args, cwd=None):
    return subprocess.run(args, cwd=cwd, check=True, text=True, capture_output=True).stdout.strip()


def github(path):
    return json.loads(run(["gh", "api", path]))


def profile_for(tag):
    match = re.fullmatch(r"v(\d+)\.(\d+)\.(\d+)", tag)
    if not match:
        raise ValueError("Choose a published stable vMAJOR.MINOR.PATCH release or latest")
    version = tuple(map(int, match.groups()))
    for profile in RECIPES["profiles"]:
        if tuple(profile["minimum"]) <= version < tuple(profile["maximum"]):
            return profile
    raise ValueError(f"No chapter patch is configured for {tag}; update the patch profiles first")


def recipe_hash():
    digest = hashlib.sha256()
    files = sorted(path for path in ROOT.rglob("*") if path.is_file() and "__pycache__" not in path.parts)
    files.append(ROOT.parent / "workflows" / "chapters.yml")
    for path in files:
        digest.update(path.relative_to(ROOT.parent).as_posix().encode() + b"\0")
        digest.update(path.read_bytes() + b"\0")
    return digest.hexdigest()


def resolve(requested, repository):
    if requested != "latest":
        profile_for(requested)
    upstream = RECIPES["upstream"]
    endpoint = "latest" if requested == "latest" else f"tags/{requested}"
    release = github(f"repos/{upstream}/releases/{endpoint}")
    if release.get("draft") or release.get("prerelease"):
        raise ValueError("Drafts and prereleases are not eligible for the stable chapter image")
    tag = release["tag_name"]
    profile = profile_for(tag)
    commit = github(f"repos/{upstream}/commits/{tag}")["sha"]
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Upstream did not resolve to a commit SHA")
    if not re.fullmatch(r"[A-Za-z0-9-]+/[A-Za-z0-9_.-]+", repository):
        raise ValueError("Expected the owner/repository of your fork")
    recipe = recipe_hash()
    build_key = hashlib.sha256(f"{commit}:{recipe}".encode()).hexdigest()
    image = f"ghcr.io/{repository.split('/')[0].lower()}/{RECIPES['image']}"
    patch = ROOT / profile["patch"]
    return {
        "release": tag,
        "upstream": upstream,
        "upstream_sha": commit,
        "profile": profile["name"],
        "recipe_sha": recipe,
        "patch_sha": hashlib.sha256(patch.read_bytes()).hexdigest(),
        "build_key": build_key,
        "image_ref": f"{image}:{tag}-chapters-{build_key[:12]}",
        "release_ref": f"{image}:{tag}-chapters",
    }


def apply(source, plan):
    source = source.resolve()
    top = Path(run(["git", "rev-parse", "--show-toplevel"], source)).resolve()
    if top != source:
        raise ValueError("The source directory must be a separate upstream checkout")
    if run(["git", "rev-parse", "HEAD"], source) != plan["upstream_sha"]:
        raise ValueError("The upstream checkout does not match the resolved commit")
    if run(["git", "status", "--porcelain"], source):
        raise ValueError("Apply chapters to a clean upstream checkout")
    profile = profile_for(plan["release"])
    patch = ROOT / profile["patch"]
    if hashlib.sha256(patch.read_bytes()).hexdigest() != plan["patch_sha"]:
        raise ValueError("The chapter patch changed after the build was resolved")
    try:
        run(["git", "apply", "--check", "--whitespace=error", str(patch)], source)
    except subprocess.CalledProcessError as error:
        raise RuntimeError(f"Chapter patch conflicts with {plan['release']}. No source was changed.\n{error.stderr}") from error
    run(["git", "apply", "--whitespace=error", str(patch)], source)


def verification_commands(profile):
    commands = [
        ["//:open-api"],
        ["//web:install"],
        ["//server:check"],
        ["//server:test", "--run", *BACKEND_TESTS, "--maxWorkers=1"],
        ["//server:test-medium", "--run", "test/medium/specs/services/asset.service.spec.ts", "test/medium/specs/services/metadata.service.spec.ts", "--maxWorkers=1"],
        ["//web:check-typescript"],
        ["//web:check-svelte"],
    ]
    web_tests = list(WEB_TESTS)
    if profile["browser_tests"]:
        commands.append(["//web:playwright-install", "--with-deps"])
        web_tests.append("src/lib/queries/asset.query.spec.ts")
    commands.append(["//web:test", "--run", *web_tests, "--maxWorkers=1"])
    if profile["browser_tests"]:
        commands.append(["//web:test-medium", "test/medium/specs/asset-viewer/chapters.spec.ts", "--workers=1"])
    return [["mise", "run", "-j", "1", *args] for args in commands]


def verify(source, plan):
    for command in verification_commands(profile_for(plan["release"])):
        print("Running:", " ".join(command), flush=True)
        subprocess.run(command, cwd=source, check=True)


def wait_for_build_retry(attempt):
    if attempt not in (1, 2):
        raise ValueError("Only two build retries are allowed")
    record = json.loads(run(["docker", "buildx", "history", "inspect", "--format", "json"]))
    error = record.get("Error") if isinstance(record, dict) else None
    message = error.get("Message", "") if isinstance(error, dict) else ""
    if (
        not isinstance(record, dict) or record.get("Status") != "failed"
        or not isinstance(message, str)
        or not re.search(r"https://ghcr\.io/v2/\S+[^\n]*(?:\b429\b|too many requests|toomanyrequests)", message, re.IGNORECASE)
    ):
        raise RuntimeError("Build did not fail with a GHCR rate limit; refusing automatic retry")
    delay = 60 * attempt
    print(f"GHCR rate limit: waiting {delay}s before build attempt {attempt + 1}/3", flush=True)
    time.sleep(delay)


def main():
    command = sys.argv[1]
    if command == "resolve":
        plan = resolve(os.environ.get("UPSTREAM_RELEASE") or "latest", os.environ["GITHUB_REPOSITORY"])
        Path("chapters-build.json").write_text(json.dumps(plan, indent=2) + "\n")
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            for key, value in plan.items():
                output.write(f"{key}={value}\n")
        print(json.dumps(plan, indent=2))
    elif command in {"apply", "verify"}:
        plan = json.loads(Path("chapters-build.json").read_text())
        function = apply if command == "apply" else verify
        function(Path(sys.argv[2]), plan)
    elif command == "wait-for-build-retry":
        wait_for_build_retry(int(sys.argv[2]))
    else:
        raise ValueError(f"Unknown command: {command}")


if __name__ == "__main__":
    main()
