import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import ci


class ChapterPipelineTests(unittest.TestCase):
    def test_profiles_match_stable_release_series(self):
        self.assertEqual(ci.profile_for("v3.3.6")["name"], "v3.3")
        self.assertEqual(ci.profile_for("v3.4.0")["name"], "v3.4")

    def test_rejects_prereleases_branches_and_shell_input(self):
        for value in ["main", "v3.4.0-rc.0", "v4.0.0", "v3.3.6\nextra", "v3.3.6; true"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                ci.profile_for(value)

    @patch("ci.time.sleep")
    @patch("ci.run")
    def test_retries_ghcr_blob_rate_limits_with_increasing_delays(self, run, sleep):
        run.return_value = json.dumps({
            "Status": "failed",
            "Error": {"Message": "failed to copy: httpReadSeeker: failed open: unexpected status from GET request to "
                      "https://ghcr.io/v2/immich-app/base-server-dev/blobs/sha256:abc: 429 Too Many Requests"},
        })
        ci.wait_for_build_retry(1)
        ci.wait_for_build_retry(2)
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [60, 120])
        run.assert_called_with(["docker", "buildx", "history", "inspect", "--format", "json"])

    @patch("ci.time.sleep")
    @patch("ci.run")
    def test_permanent_build_failures_and_other_services_are_not_retried(self, run, sleep):
        for message in [
            "process pnpm build did not complete successfully: exit code: 1",
            "unexpected status from GET request to https://ghcr.io/v2/example/image/blobs/sha256:abc: 403 Forbidden",
            "unexpected status from GET request to https://registry.npmjs.org/package: 429 Too Many Requests",
            "process echo 429 did not complete successfully",
        ]:
            run.return_value = json.dumps({"Status": "failed", "Error": {"Message": message}})
            with self.subTest(message=message), self.assertRaisesRegex(RuntimeError, "refusing automatic retry"):
                ci.wait_for_build_retry(1)
        sleep.assert_not_called()

    @patch("ci.time.sleep")
    @patch("ci.run")
    def test_missing_or_nonfailed_build_records_are_not_retried(self, run, sleep):
        rate_limit = {"Message": "https://ghcr.io/v2/example/image/blobs/sha256:abc: 429 Too Many Requests"}
        for record in [None, [], {}, {"Status": "failed", "Error": None},
                       {"Status": "failed", "Error": {"Message": None}},
                       {"Status": "canceled", "Error": rate_limit},
                       {"Status": "completed", "Error": rate_limit}]:
            run.return_value = json.dumps(record)
            with self.subTest(record=record), self.assertRaises(RuntimeError):
                ci.wait_for_build_retry(1)
        sleep.assert_not_called()

    @patch("ci.time.sleep")
    @patch("ci.run")
    def test_history_inspection_failures_do_not_trigger_retries(self, run, sleep):
        run.side_effect = subprocess.CalledProcessError(1, "docker")
        with self.assertRaises(subprocess.CalledProcessError):
            ci.wait_for_build_retry(1)
        run.side_effect = None
        run.return_value = "invalid JSON"
        with self.assertRaises(json.JSONDecodeError):
            ci.wait_for_build_retry(1)
        sleep.assert_not_called()

    @patch("ci.time.sleep")
    @patch("ci.run")
    def test_retry_budget_cannot_be_exceeded(self, run, sleep):
        for attempt in [0, 3]:
            with self.subTest(attempt=attempt), self.assertRaises(ValueError):
                ci.wait_for_build_retry(attempt)
        run.assert_not_called()
        sleep.assert_not_called()

    @patch("ci.github")
    def test_resolves_only_published_stable_releases(self, github):
        github.return_value = {"tag_name": "v3.3.6", "prerelease": True}
        with self.assertRaises(ValueError):
            ci.resolve("latest", "ArvidSagbrant/immich")

    @patch("ci.github")
    def test_image_tags_include_the_source_and_recipe(self, github):
        def response(path):
            if "/commits/" in path:
                return {"sha": "a" * 40}
            return {"tag_name": "v3.3.6", "prerelease": False, "draft": False}

        github.side_effect = response
        first = ci.resolve("latest", "ArvidSagbrant/immich")
        self.assertRegex(first["image_ref"], r"^ghcr.io/arvidsagbrant/immich-server-chapters:v3\.3\.6-chapters-[a-f0-9]{12}$")
        self.assertEqual(first["image_ref"], ci.resolve("latest", "ArvidSagbrant/immich")["image_ref"])
        with patch("ci.recipe_hash", return_value="changed"):
            self.assertNotEqual(first["image_ref"], ci.resolve("latest", "ArvidSagbrant/immich")["image_ref"])

    def test_verification_is_serial_and_uses_the_correct_web_test_framework(self):
        for tag in ["v3.3.6", "v3.4.0"]:
            commands = ci.verification_commands(ci.profile_for(tag))
            self.assertTrue(all(command[:4] == ["mise", "run", "-j", "1"] for command in commands))
            self.assertEqual(commands[0][-1], "//:open-api")
            self.assertEqual(any("//web:test-medium" in command for command in commands), tag == "v3.4.0")

    def test_apply_checks_conflicts_before_writing_any_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "--quiet", directory], check=True)
            subprocess.run(["git", "-C", directory, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--quiet", "--allow-empty", "-m", "base"], check=True)
            commit = ci.run(["git", "rev-parse", "HEAD"], root)
            patch_path = ci.ROOT / ci.profile_for("v3.3.6")["patch"]
            plan = {
                "release": "v3.3.6",
                "upstream_sha": commit,
                "patch_sha": ci.hashlib.sha256(patch_path.read_bytes()).hexdigest(),
            }
            with self.assertRaisesRegex(RuntimeError, "No source was changed"):
                ci.apply(root, plan)
            self.assertEqual(ci.run(["git", "status", "--porcelain"], root), "")

    def test_generated_clients_are_not_in_the_patch(self):
        for profile in ci.RECIPES["profiles"]:
            content = (ci.ROOT / profile["patch"]).read_text()
            self.assertNotIn("diff --git a/open-api/immich-openapi-specs.json", content)
            self.assertNotIn("diff --git a/packages/sdk/src/fetch-client.ts", content)
            self.assertIn("AssetMetadataKey.VideoChapters", content)


if __name__ == "__main__":
    unittest.main()
