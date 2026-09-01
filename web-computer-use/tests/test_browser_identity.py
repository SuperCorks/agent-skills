from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import browser_identity


class BrowserIdentityTests(unittest.TestCase):
    def test_native_parent_identifies_each_supported_chromium_browser(self):
        paths = {
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome": "chrome",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser": "brave",
            "/Users/example/Applications/Comet.app/Contents/MacOS/Comet": "comet",
            "/Applications/Comet.app/Contents/Frameworks/Comet Framework.framework/Helpers/Comet Helper.app/Contents/MacOS/Comet Helper": "comet",
        }
        for executable, expected in paths.items():
            with self.subTest(expected=expected), patch.object(browser_identity, "parent_executable", return_value=executable):
                self.assertEqual(browser_identity.detect_browser(), expected)

    def test_macos_code_sign_clone_identifies_each_supported_browser(self):
        paths = {
            "/private/var/folders/example/X/com.google.Chrome.code_sign_clone/code_sign_clone.a/Google Chrome.app.bundle/Contents/MacOS/Google Chrome": "chrome",
            "/private/var/folders/example/X/com.brave.Browser.code_sign_clone/code_sign_clone.b/Brave Browser.app.bundle/Contents/MacOS/Brave Browser": "brave",
            "/private/var/folders/example/X/ai.perplexity.comet.code_sign_clone/code_sign_clone.c/Comet.app.bundle/Contents/MacOS/Comet": "comet",
        }
        for executable, expected in paths.items():
            with self.subTest(expected=expected), patch.object(browser_identity, "parent_executable", return_value=executable):
                self.assertEqual(browser_identity.detect_browser(), expected)

    def test_ambiguous_or_unrelated_processes_do_not_default_to_chrome(self):
        for executable in ("", "/usr/bin/python3", "/Applications/My Browser.app/Contents/MacOS/Google Chrome",
                           "/Applications/My Browser.app.bundle/Contents/MacOS/Google Chrome",
                           "/tmp/Google Chrome.app/not-an-app", "/tmp/Google Chrome.app.bundle/not-an-app",
                           "/Applications/Another.app/Contents/Google Chrome.app/Contents/MacOS/Chrome"):
            self.assertIsNone(browser_identity.browser_from_executable(executable))

    def test_unavailable_process_api_falls_back_to_manual_selection(self):
        with patch.object(browser_identity.sys, "platform", "darwin"), \
             patch.object(browser_identity.ctypes, "CDLL", side_effect=OSError("unavailable")):
            self.assertIsNone(browser_identity.detect_browser())
        with patch.object(browser_identity.sys, "platform", "linux"):
            self.assertIsNone(browser_identity.detect_browser())
