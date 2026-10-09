import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import bsk_profiles


def connection(instance_id, label=""):
    return {"instance_id": instance_id, "browser_name": "chrome", "browser_version": "154.0.0.0", "label": label}


class BskProfilesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.roots = {"chrome": self.base / "Chrome", "brave": self.base / "Brave"}
        self.registry = self.base / "state/nested/bsk-profiles.json"

    def tearDown(self):
        self.temp.cleanup()

    def profile(self, browser, folder, name, *ids, file="000003.log", extension=True):
        root = self.roots[browser]
        local_state = root / "Local State"
        state = json.loads(local_state.read_text()) if local_state.exists() else {"profile": {"info_cache": {}}}
        state["profile"]["info_cache"][folder] = {"name": name, "gaia_name": "Not read"}
        root.mkdir(parents=True, exist_ok=True)
        local_state.write_text(json.dumps(state))
        (root / folder).mkdir(exist_ok=True)
        if extension:
            store = bsk_profiles.settings_dir(root, folder)
            store.mkdir(parents=True, exist_ok=True)
            data = b"".join(b"\x01\x0fbsk_instance_id\n\"" + value.encode() + b"\"" for value in ids)
            (store / file).write_bytes(b"\x00junk" + data + b"bsk_daemon_port\x05 9222")

    def refresh(self, *connected):
        return bsk_profiles.refresh(self.registry, self.roots,
                                    connections={instance_id: connection(instance_id) for instance_id in connected})

    def by_name(self, registry):
        return {(item["browser"], item["profile_name"]): item for item in registry["profiles"]}

    def test_matches_stored_ids_in_chrome_and_brave(self):
        self.profile("chrome", "Default", "Default", "df2b5a37")
        self.profile("chrome", "Profile 7", "Nester", "16a09ceb", file="000005.ldb")
        self.profile("brave", "Default", "Work", "c09fe2c1")
        profiles = self.by_name(self.refresh("16a09ceb", "c09fe2c1"))
        self.assertEqual(profiles["chrome", "Nester"]["instance_id"], "16a09ceb")
        self.assertTrue(profiles["chrome", "Nester"]["connected"])
        self.assertEqual(profiles["brave", "Work"]["instance_id"], "c09fe2c1")
        self.assertEqual(profiles["chrome", "Default"]["instance_id"], "df2b5a37")
        self.assertFalse(profiles["chrome", "Default"]["connected"])

    def test_registry_keeps_disconnected_profiles_and_their_last_connection(self):
        self.profile("chrome", "Profile 9", "Ozie", "08e0ce2a")
        first = self.by_name(self.refresh("08e0ce2a"))["chrome", "Ozie"]
        second = self.by_name(self.refresh())["chrome", "Ozie"]
        self.assertEqual(second["instance_id"], "08e0ce2a")
        self.assertFalse(second["connected"])
        self.assertEqual(second["last_connected_at"], first["last_connected_at"])
        self.assertEqual(json.loads(self.registry.read_text())["profiles"][0]["instance_id"], "08e0ce2a")

    def test_id_that_moved_to_another_profile_is_listed_only_there(self):
        self.profile("chrome", "Profile 1", "Old", "aaaaaaaa")
        self.refresh()
        bsk_profiles.settings_dir(self.roots["chrome"], "Profile 1").joinpath("000003.log").write_bytes(b"")
        self.profile("chrome", "Profile 2", "New", "aaaaaaaa")
        profiles = self.by_name(self.refresh())
        self.assertEqual(profiles["chrome", "New"]["instance_id"], "aaaaaaaa")
        self.assertIsNone(profiles["chrome", "Old"]["instance_id"])
        self.assertEqual(profiles["chrome", "Old"]["status"], "unresolved")

    def test_deleted_profile_folder_is_dropped(self):
        self.profile("chrome", "Profile 3", "Gone", "bbbbbbbb")
        self.refresh()
        (self.roots["chrome"] / "Profile 3").rename(self.base / "elsewhere")
        self.assertEqual(self.refresh()["profiles"], [])

    def test_several_stored_ids_use_the_connected_one_or_stay_unresolved(self):
        self.profile("chrome", "Profile 4", "HOP", "11111111", "22222222")
        self.assertEqual(self.by_name(self.refresh("22222222"))["chrome", "HOP"]["instance_id"], "22222222")
        unresolved = self.by_name(self.refresh())["chrome", "HOP"]
        self.assertEqual(unresolved["status"], "unresolved")
        self.assertEqual(unresolved["candidates"], ["11111111", "22222222"])

    def test_connected_id_found_verbatim_resolves_a_compressed_store(self):
        self.profile("chrome", "Profile 6", "MMS")
        store = bsk_profiles.settings_dir(self.roots["chrome"], "Profile 6")
        (store / "000009.ldb").write_bytes(b'\x00compressed\x07"abc68afc"\x00')
        self.assertEqual(self.by_name(self.refresh())["chrome", "MMS"]["status"], "unresolved")
        self.assertEqual(self.by_name(self.refresh("abc68afc"))["chrome", "MMS"]["instance_id"], "abc68afc")

    def test_copied_profile_with_duplicate_id_is_never_guessed(self):
        self.profile("chrome", "Profile 1", "One", "cccccccc")
        self.profile("chrome", "Profile 2", "Two", "cccccccc")
        statuses = {item["profile_name"]: item["status"] for item in self.refresh("cccccccc")["profiles"]}
        self.assertEqual(statuses, {"One": "unresolved", "Two": "unresolved"})

    def test_unmatched_connection_and_missing_extension_are_reported(self):
        self.profile("chrome", "Profile 8", "Plain", extension=False)
        registry = self.refresh("dddddddd")
        self.assertEqual(registry["profiles"][0]["status"], "extension_missing")
        self.assertEqual([item["instance_id"] for item in registry["unknown_connections"]], ["dddddddd"])

    def test_bsk_failure_keeps_ids_with_unknown_connection_state(self):
        self.profile("chrome", "Profile 7", "Nester", "16a09ceb")
        registry = bsk_profiles.refresh(self.registry, self.roots, connections=None, bsk_error="daemon down")
        self.assertIsNone(registry["profiles"][0]["connected"])
        self.assertEqual(registry["bsk_error"], "daemon down")
        self.assertEqual(bsk_profiles.resolve(registry, "Nester")["instance_id"], "16a09ceb")

    def test_resolve_matches_names_then_folders(self):
        self.profile("chrome", "Default", "Default", "df2b5a37")
        self.profile("chrome", "Profile 9", "Ozie", "08e0ce2a")
        self.profile("brave", "Default", "Work", "c09fe2c1")
        registry = self.refresh("df2b5a37")
        self.assertEqual(bsk_profiles.resolve(registry, "default")["instance_id"], "df2b5a37")
        self.assertEqual(bsk_profiles.resolve(registry, "profile 9")["instance_id"], "08e0ce2a")
        ozie = bsk_profiles.resolve(registry, "OZIE")
        self.assertFalse(ozie["connected"])
        self.assertEqual(ozie["open_command"][-1], "--profile-directory=Profile 9")
        self.assertIsNone(bsk_profiles.resolve(registry, "Default")["open_command"])

    def test_resolve_rejects_missing_ambiguous_and_unreadable_profiles(self):
        self.profile("chrome", "Profile 1", "Shared", "eeeeeeee")
        self.profile("brave", "Default", "Shared", "ffffffff")
        self.profile("chrome", "Profile 2", "Blank")
        self.profile("chrome", "Profile 3", "Plain", extension=False)
        registry = self.refresh()
        for name, browser, code in (("nope", None, "not_found"), ("Shared", None, "ambiguous"),
                                    ("Blank", None, "unresolved"), ("Plain", None, "extension_missing")):
            with self.subTest(name=name), self.assertRaises(bsk_profiles.ProfileError) as caught:
                bsk_profiles.resolve(registry, name, browser)
            self.assertEqual(caught.exception.code, code)
        self.assertEqual(bsk_profiles.resolve(registry, "Shared", "brave")["instance_id"], "ffffffff")

    def test_registry_write_is_atomic_and_creates_its_folder(self):
        self.profile("chrome", "Default", "Default", "df2b5a37")
        self.refresh()
        self.assertEqual(sorted(path.name for path in self.registry.parent.iterdir()), ["bsk-profiles.json"])
        with patch.object(bsk_profiles.os, "replace", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                self.refresh("df2b5a37")
        self.assertEqual(sorted(path.name for path in self.registry.parent.iterdir()), ["bsk-profiles.json"])
        self.assertFalse(json.loads(self.registry.read_text())["profiles"][0]["connected"])

    def test_cli_resolve_exit_codes(self):
        self.profile("chrome", "Profile 7", "Nester", "16a09ceb")
        with patch.object(bsk_profiles, "connected_browsers", return_value=({}, None)), \
                patch("sys.stdout") as stdout:
            self.assertEqual(bsk_profiles.main(["--registry", str(self.registry), "resolve", "Nester"], self.roots), 0)
            self.assertEqual(bsk_profiles.main(["--registry", str(self.registry), "resolve", "nope"], self.roots), 1)
        written = "".join(call.args[0] for call in stdout.write.call_args_list)
        self.assertIn('"instance_id": "16a09ceb"', written)
        self.assertIn('"code": "not_found"', written)


if __name__ == "__main__":
    unittest.main()
