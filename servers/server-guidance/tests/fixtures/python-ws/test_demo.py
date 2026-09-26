from demo import add
import warnings


def test_add() -> None:
    assert add(2, 3) == 5


def test_emits_warning_with_fake_credential() -> None:
    # E2E fixture (SC-004): a fake GitHub token surfaces in the pytest
    # warnings summary; the guidance result must redact it.
    warnings.warn("ci credential: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234")
