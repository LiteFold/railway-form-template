import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.cap_site_key import auto_provision, auto_provision_new_form, is_cap_configured


@pytest.mark.asyncio
async def test_auto_provision_success():
    mock_conn = AsyncMock()
    mock_pool = MagicMock()
    mock_pool.acquire.return_value.__aenter__ = AsyncMock(return_value=mock_conn)
    mock_pool.acquire.return_value.__aexit__ = AsyncMock(return_value=None)

    with patch("app.cap_site_key.create_cap_site_key", new=AsyncMock(return_value={"site_key": "test-key", "secret_key": "test-secret"})):
        with patch("app.cap_site_key.settings") as mock_settings:
            mock_settings.cap_endpoint = "https://cap.example.com"
            mock_settings.cap_secret_key = "admin-secret"

            result = await auto_provision(mock_pool, "test-slug")

            assert result is True
            mock_conn.execute.assert_called_once_with(
                "UPDATE forms SET cap_site_key = $1, cap_site_secret = $2 WHERE slug = $3",
                "test-key", "test-secret", "test-slug",
            )


@pytest.mark.asyncio
async def test_auto_provision_no_config():
    mock_pool = AsyncMock()

    with patch("app.cap_site_key.create_cap_site_key", new=AsyncMock()) as mock_create:
        with patch("app.cap_site_key.settings") as mock_settings:
            mock_settings.cap_endpoint = None
            mock_settings.cap_secret_key = None

            result = await auto_provision(mock_pool, "test-slug")

            assert result is False
            mock_create.assert_not_called()


@pytest.mark.asyncio
async def test_auto_provision_api_failure():
    mock_pool = AsyncMock()
    mock_pool.acquire = AsyncMock()

    with patch("app.cap_site_key.create_cap_site_key", new=AsyncMock(return_value=None)):
        with patch("app.cap_site_key.settings") as mock_settings:
            mock_settings.cap_endpoint = "https://cap.example.com"
            mock_settings.cap_secret_key = "admin-secret"

            result = await auto_provision(mock_pool, "test-slug")

            assert result is False


def test_is_cap_configured_true():
    with patch("app.cap_site_key.settings") as mock_settings:
        mock_settings.cap_endpoint = "https://cap.example.com"
        mock_settings.cap_secret_key = "admin-secret"
        assert is_cap_configured() is True


def test_is_cap_configured_false():
    with patch("app.cap_site_key.settings") as mock_settings:
        mock_settings.cap_endpoint = None
        mock_settings.cap_secret_key = "admin-secret"
        assert is_cap_configured() is False
